/** The event could not be delivered. */
export class EventPublishError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'EventPublishError';
  }
}
