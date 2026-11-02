import Joi from 'joi';

export class ListItemsDto {
  limit: number;
  offset: number;
}

export const listItemsSchema = Joi.object<ListItemsDto>({
  limit: Joi.number().integer().min(1).max(100).default(20),
  offset: Joi.number().integer().min(0).default(0),
});
