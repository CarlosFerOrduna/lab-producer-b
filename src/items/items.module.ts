import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventQueueModule } from '../queue/event-queue.module';
import { ItemEntity } from './entities/item.entity';
import { ItemsController } from './items.controller';
import { ItemsRepository } from './items.repository';
import { ItemsService } from './items.service';

@Module({
  imports: [TypeOrmModule.forFeature([ItemEntity]), EventQueueModule],
  controllers: [ItemsController],
  providers: [ItemsRepository, ItemsService],
})
export class ItemsModule {}
