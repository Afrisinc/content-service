import type { FastifyReply } from 'fastify';

function convertBigInts(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }
  if (typeof obj === 'bigint') {
    return obj.toString();
  }
  if (typeof obj === 'object') {
    if (Array.isArray(obj)) {
      return obj.map(convertBigInts);
    }
    // A Date has no enumerable own properties, so walking it as a plain object
    // yields `{}` and every timestamp reaches the client unusable.
    if (obj instanceof Date) {
      return obj.toISOString();
    }
    const converted: any = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        converted[key] = convertBigInts(obj[key]);
      }
    }
    return converted;
  }
  return obj;
}

/**
 * Success response following Afrisinc standard
 * @param reply FastifyReply object
 * @param httpCode HTTP status code
 * @param message Human-readable message (resp_msg)
 * @param respCode Internal response code (1xxx for success)
 * @param data Response payload
 */
export const success = (
  reply: FastifyReply,
  httpCode: number,
  message: string,
  respCode: number = 1000,
  data?: any
) =>
  reply
    .status(httpCode)
    .send({ success: true, resp_msg: message, resp_code: respCode, data: convertBigInts(data) });

/**
 * Error response following Afrisinc standard
 * @param reply FastifyReply object
 * @param httpCode HTTP status code
 * @param message Human-readable message (resp_msg)
 * @param respCode Internal response code (2xxx/3xxx/4xxx/5xxx/9xxx)
 */
export const error = (
  reply: FastifyReply,
  httpCode: number,
  message: string,
  respCode: number = 2000
) => reply.status(httpCode).send({ success: false, resp_msg: message, resp_code: respCode });
