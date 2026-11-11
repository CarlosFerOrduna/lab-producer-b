import { ErrorCausesUtil } from '../common/utils/error-causes.util';
import { PUBLISHING } from './constants/publishing.constant';

/** Helpers to classify Kafka client errors. */
export class KafkaConnectionUtil {
  /** Whether a Kafka connection failed on a certificate (anywhere in the chain): retrying cannot fix it. */
  static isCertificateError(error: unknown): boolean {
    return ErrorCausesUtil.some(error, (candidate) => {
      const { code } = (candidate ?? {}) as { code?: unknown };
      return typeof code === 'string' && PUBLISHING.certificateErrorCodes.some((pattern) => pattern.test(code));
    });
  }

  /** Whether Kafka refused the record itself (anywhere in the chain): sending it again gets the same answer. */
  static isRejectedRecord(error: unknown): boolean {
    return ErrorCausesUtil.some(error, (candidate) => {
      const { apiId } = (candidate ?? {}) as { apiId?: unknown };
      return typeof apiId === 'string' && (PUBLISHING.rejectedErrorCodes as readonly string[]).includes(apiId);
    });
  }
}
