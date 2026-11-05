import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { JoiValidationPipe } from '../common/pipes/joi-validation.pipe';
import { CreateItemDto, createItemSchema } from './dto/create-item.dto';
import { ListItemsDto, listItemsSchema } from './dto/list-items.dto';
import { ItemEntity } from './entities/item.entity';
import { ItemsService } from './items.service';

@Controller('items')
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) {}

  @Post()
  create(@Body(new JoiValidationPipe(createItemSchema)) item: CreateItemDto): Promise<ItemEntity> {
    return this.itemsService.create(item);
  }

  @Get()
  list(@Query(new JoiValidationPipe(listItemsSchema)) query: ListItemsDto): Promise<ItemEntity[]> {
    return this.itemsService.list(query);
  }

  /** Answers with the X-Cache header (HIT or MISS), so the cache's effect is visible from outside. */
  @Get(':id')
  async getById(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ItemEntity> {
    const { item, cacheStatus } = await this.itemsService.getById(id);
    response.setHeader('X-Cache', cacheStatus);
    return item;
  }
}
