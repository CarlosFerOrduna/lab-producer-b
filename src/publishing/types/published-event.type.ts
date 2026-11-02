export interface PublishedEvent {
  id: string;
  source: string;
  type: string;
  occurredAt: string;
  payload: object;
}
