import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker/worker.module';

// El worker solo expone GET /health: lo necesita su liveness probe.
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(WorkerModule);
  app.enableShutdownHooks();
  const config = app.get(ConfigService);
  const port = config.getOrThrow<number>('PORT');
  await app.listen(port);
}

void bootstrap();
