/** The event could not be stored in the queue. */
export class EventEnqueueError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'EventEnqueueError';
  }
}
