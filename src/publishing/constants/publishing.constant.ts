export const PUBLISHING = {
  eventPublisherToken: Symbol('EventPublisher'),
  eventSource: 'producer-b',
  // Tope de una publicación: después el job falla y BullMQ lo reintenta con su backoff.
  sendTimeoutMs: 5000,
  // Con idempotent: true y sin retries, la librería reintenta para siempre: un send colgado sobreviviría al
  // timeout de 5 s y se acumularía con los reintentos de BullMQ. Con estos valores se rinde solo en unos 10 s
  // (3 intentos de 3 s como mucho). El pedido espera más que los acks: si no, cortaría una respuesta en camino.
  clientConnectTimeoutMs: 2000,
  clientRequestTimeoutMs: 3000,
  produceAckTimeoutMs: 2000,
  clientRetries: 2,
  clientRetryDelayMs: 500,
  // Tope total para que Kafka responda al arrancar: después sale con 1 y el CrashLoopBackOff decide cuándo reintentar.
  startupTimeoutMs: 120_000,
  startupRetryDelayMs: 2000,
  // Errores de certificado: reintentarlos no cambia nada, así que el arranque falla en el primer intento.
  // ERR_TLS_HANDSHAKE_TIMEOUT queda afuera a propósito: es un timeout, no un certificado.
  certificateErrorCodes: [
    /^ERR_TLS_(?!HANDSHAKE_TIMEOUT$)/,
    /CERT/,
    /^UNABLE_TO_VERIFY_LEAF_SIGNATURE$/,
    /UNKNOWN_CA$/,
  ],
  // Errores de Kafka atribuibles al evento mismo: mandarlo de nuevo daría la misma respuesta.
  rejectedErrorCodes: ['MESSAGE_TOO_LARGE', 'INVALID_RECORD'],
} as const;
