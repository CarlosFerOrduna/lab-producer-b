import { Inject, Logger, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { ITEM_CACHE } from './constants/item-cache.constant';

@Module({
  providers: [
    {
      provide: ITEM_CACHE.clientToken,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const client = new Redis({
          host: config.getOrThrow<string>('CACHE_HOST'),
          port: config.getOrThrow<number>('CACHE_PORT'),
          password: config.getOrThrow<string>('CACHE_PASSWORD'),
          // Sin cola offline ni reintentos: con la caché caída, cada lectura va directo a la base.
          enableOfflineQueue: false,
          maxRetriesPerRequest: 0,
          commandTimeout: ITEM_CACHE.commandTimeoutMs,
          connectTimeout: ITEM_CACHE.connectTimeoutMs,
        });
        const logger = new Logger('ItemCache');
        client.on('error', (error: Error) => logger.warn(`Cache unavailable: ${error.message}`));
        return client;
      },
    },
  ],
  exports: [ITEM_CACHE.clientToken],
})
export class ItemCacheModule implements OnApplicationShutdown {
  constructor(@Inject(ITEM_CACHE.clientToken) private readonly cacheClient: Redis) {}

  onApplicationShutdown(): void {
    this.cacheClient.disconnect();
  }
}
