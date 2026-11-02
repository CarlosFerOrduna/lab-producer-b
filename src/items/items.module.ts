import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PublishingModule } from '../publishing/publishing.module';
import { ItemEntity } from './entities/item.entity';
import { ItemsController } from './items.controller';
import { ItemsRepository } from './items.repository';
import { ItemsService } from './items.service';

@Module({
  imports: [TypeOrmModule.forFeature([ItemEntity]), PublishingModule],
  controllers: [ItemsController],
  providers: [ItemsRepository, ItemsService],
})
export class ItemsModule {}
