import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
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

  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string): Promise<ItemEntity> {
    return this.itemsService.getById(id);
  }
}
