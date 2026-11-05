import Joi from 'joi';

const processEnvKeys = {
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('production'),
  PORT: Joi.number().port().default(3000),
};

const queueEnvKeys = {
  QUEUE_HOST: Joi.string().hostname().required(),
  QUEUE_PORT: Joi.number().port().default(6379),
  QUEUE_PASSWORD: Joi.string().required(),
};

/** What the migrations need: only the database connection. */
export const databaseEnvValidationSchema = Joi.object({
  DATABASE_HOST: Joi.string().hostname().required(),
  DATABASE_PORT: Joi.number().port().default(5432),
  DATABASE_NAME: Joi.string().required(),
  DATABASE_USER: Joi.string().required(),
  DATABASE_PASSWORD: Joi.string().required(),
});

/** What the API needs: the database and the queue. */
export const apiEnvValidationSchema = databaseEnvValidationSchema.keys({
  ...processEnvKeys,
  ...queueEnvKeys,
});

/** What the worker needs: the queue, and where to publish the events. */
export const workerEnvValidationSchema = Joi.object({
  ...processEnvKeys,
  ...queueEnvKeys,
  PROCESSOR_URL: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .required(),
});
