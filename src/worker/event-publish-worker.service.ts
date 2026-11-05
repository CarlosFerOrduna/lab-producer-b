import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker } from 'bullmq';
import { PublishedEvent } from '../publishing/types/published-event.type';
import { EVENT_QUEUE } from '../queue/constants/event-queue.constant';
import { EventQueueUtil } from '../queue/event-queue.util';
import { EventPublishProcessor } from './event-publish.processor';

/** Takes events from the queue and publishes them to the processor. */
@Injectable()
export class EventPublishWorkerService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(EventPublishWorkerService.name);
  private worker?: Worker<PublishedEvent>;

  constructor(
    private readonly config: ConfigService,
    private readonly eventPublishProcessor: EventPublishProcessor,
  ) {}

  onApplicationBootstrap(): void {
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
  }

  async onApplicationShutdown(): Promise<void> {
    // close() espera a que terminen los jobs en curso: un rollout no corta un evento a medio publicar.
    await this.worker?.close();
  }
}
