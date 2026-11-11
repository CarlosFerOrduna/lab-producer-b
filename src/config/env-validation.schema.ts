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

/** What the API needs: the database, the queue and the cache. */
export const apiEnvValidationSchema = databaseEnvValidationSchema.keys({
  ...processEnvKeys,
  ...queueEnvKeys,
  CACHE_HOST: Joi.string().hostname().required(),
  CACHE_PORT: Joi.number().port().default(6379),
  CACHE_PASSWORD: Joi.string().required(),
});

/** What the worker needs: the queue, plus the Kafka topic it publishes to and its client certificate. */
export const workerEnvValidationSchema = Joi.object({
  ...processEnvKeys,
  ...queueEnvKeys,
  KAFKA_BOOTSTRAP_BROKERS: Joi.string().required(),
  KAFKA_CLIENT_ID: Joi.string().default('producer-b-worker'),
  KAFKA_TOPIC: Joi.string().required(),
  KAFKA_CA_FILE: Joi.string().required(),
  KAFKA_CERT_FILE: Joi.string().required(),
  KAFKA_KEY_FILE: Joi.string().required(),
});
