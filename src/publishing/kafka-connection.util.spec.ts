import { ProtocolError } from '@platformatic/kafka';
import { KafkaConnectionUtil } from './kafka-connection.util';

function codedError(code: string): Error {
  return Object.assign(new Error(code), { code });
}

describe('KafkaConnectionUtil', () => {
  describe('isCertificateError', () => {
    it.each([
      'ERR_TLS_CERT_ALTNAME_INVALID',
      'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
      'CERT_HAS_EXPIRED',
      'ERR_SSL_TLSV1_ALERT_UNKNOWN_CA',
    ])('treats %s, nested in an AggregateError, as a certificate error', (code) => {
      const error = new AggregateError([codedError(code)], 'Cannot connect to any broker.');

      expect(KafkaConnectionUtil.isCertificateError(error)).toBe(true);
    });

    it.each(['ERR_TLS_HANDSHAKE_TIMEOUT', 'ECONNREFUSED', 'ENOTFOUND'])(
      'does not treat %s as a certificate error',
      (code) => {
        expect(KafkaConnectionUtil.isCertificateError(codedError(code))).toBe(false);
      },
    );
  });

  describe('isRejectedRecord', () => {
    it.each(['MESSAGE_TOO_LARGE', 'INVALID_RECORD'])('treats a nested %s as a rejected record', (apiId) => {
      const error = new Error('Producing failed.', { cause: new ProtocolError(apiId) });

      expect(KafkaConnectionUtil.isRejectedRecord(error)).toBe(true);
    });

    it('does not treat a leader change as a rejected record', () => {
      expect(KafkaConnectionUtil.isRejectedRecord(new ProtocolError('NOT_LEADER_OR_FOLLOWER'))).toBe(false);
    });
  });
});
