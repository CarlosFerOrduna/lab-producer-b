import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { apiEnvValidationSchema } from './config/env-validation.schema';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { ReadinessModule } from './health/readiness.module';
import { ItemsModule } from './items/items.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
      validationSchema: apiEnvValidationSchema,
    }),
    DatabaseModule,
    HealthModule,
    ReadinessModule,
    ItemsModule,
  ],
})
export class AppModule {}
