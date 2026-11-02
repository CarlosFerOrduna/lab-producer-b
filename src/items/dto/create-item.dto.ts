import Joi from 'joi';

export class CreateItemDto {
  name: string;
  quantity: number;
}

export const createItemSchema = Joi.object<CreateItemDto>({
  name: Joi.string().max(100).required(),
  quantity: Joi.number().integer().min(0).required(),
});
