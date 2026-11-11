import { PublishedEvent } from './types/published-event.type';

/** Helpers for the Kafka key of an event. */
export class EventKeyUtil {
  /**
   * The key of an event: the id of the item it is about, so every event of one item goes to the same
   * partition. Falls back to the event id for an event without an item id.
   */
  static keyOf(event: PublishedEvent): string {
    const { itemId } = event.payload as { itemId?: unknown };
    // Todo evento de producer-b trae itemId; el respaldo solo cubre un payload inesperado, sin perder el evento.
    return typeof itemId === 'string' ? itemId : event.id;
  }
}
