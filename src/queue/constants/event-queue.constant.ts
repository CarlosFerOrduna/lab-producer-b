export const EVENT_QUEUE = {
  name: 'events',
  jobName: 'publish',
  queueToken: Symbol('EventQueue'),
  probeClientToken: Symbol('EventQueueProbeClient'),
  // Con reintentos de 1 minuto como máximo, alcanza para cerca de un día antes de marcar el job como fallido.
  attempts: 1440,
  initialBackoffMs: 1000,
  maxBackoffMs: 60_000,
  // Con noeviction, Valkey nunca libera memoria solo: hay que recortar los jobs terminados.
  keepCompletedJobs: 1000,
  keepFailedJobsSeconds: 7 * 24 * 60 * 60,
  workerConcurrency: 5,
} as const;
