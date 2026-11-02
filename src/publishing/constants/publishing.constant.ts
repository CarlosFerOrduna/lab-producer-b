export const PUBLISHING = {
  eventPublisherToken: Symbol('EventPublisher'),
  eventSource: 'producer-b',
  maxAttempts: 3,
  initialBackoffMs: 200,
  requestTimeoutMs: 2000,
} as const;
