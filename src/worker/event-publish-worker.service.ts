import { BeforeApplicationShutdown, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker } from 'bullmq';
import { KafkaStartupService } from '../publishing/kafka-startup.service';
import { PublishedEvent } from '../publishing/types/published-event.type';
import { EVENT_QUEUE } from '../queue/constants/event-queue.constant';
import { EventQueueUtil } from '../queue/event-queue.util';
import { EventPublishProcessor } from './event-publish.processor';

/** Takes events from the queue and publishes them, once Kafka answers. */
@Injectable()
export class EventPublishWorkerService implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly logger = new Logger(EventPublishWorkerService.name);
  private worker?: Worker<PublishedEvent>;
  private starting?: Promise<void>;

  constructor(
    private readonly config: ConfigService,
    private readonly eventPublishProcessor: EventPublishProcessor,
    private readonly kafkaStartup: KafkaStartupService,
  ) {}

  onApplicationBootstrap(): void {
    // No se espera: Nest no abre el puerto de /health hasta que terminan estos hooks, y que Kafka responda
    // puede llevar minutos de reintentos. Esperando, la liveness mataría el pod antes de que se vea por qué.
    this.starting = this.kafkaStartup.start(() => this.startWorker());
  }

  private startWorker(): void {
    this.worker = new Worker<PublishedEvent>(EVENT_QUEUE.name, (job) => this.eventPublishProcessor.process(job), {
      // BullMQ exige maxRetriesPerRequest: null en el worker: sus comandos bloqueantes esperan sin límite.
      connection: { ...EventQueueUtil.connectionOptions(this.config), maxRetriesPerRequest: null },
      concurrency: EVENT_QUEUE.workerConcurrency,
      settings: { backoffStrategy: (attemptsMade) => EventQueueUtil.backoffDelay(attemptsMade) },
    });
    this.worker.on('completed', (job) => this.logger.log(`Event ${job.id} published`));
    this.worker.on('failed', (job, error) =>
      this.logger.warn(`Event ${job?.id} attempt ${job?.attemptsMade} failed: ${error.message}`),
    );
    this.logger.log(`Taking events from the ${EVENT_QUEUE.name} queue`);
  }

  async beforeApplicationShutdown(): Promise<void> {
    this.kafkaStartup.stop();
    await this.starting;
    // close() espera a que terminen los jobs en curso: un rollout no corta un evento a medio publicar.
    // Va en beforeApplicationShutdown porque el producer de Kafka se cierra después, en onApplicationShutdown.
    await this.worker?.close();
  }
}
