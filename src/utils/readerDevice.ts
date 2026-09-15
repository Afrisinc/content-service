import { FastifyRequest } from 'fastify';
import { BadRequestError } from '@/utils/http-error';

/** The anonymous, per-browser id the reading UI generates and sends on every request. */
export function readerDeviceId(request: FastifyRequest): string | undefined {
  const header = request.headers['x-reader-device-id'];
  const value = Array.isArray(header) ? header[0] : header;
  return value && value.trim() ? value.trim() : undefined;
}

export function requireReaderDeviceId(request: FastifyRequest): string {
  const deviceId = readerDeviceId(request);
  if (!deviceId) {
    throw new BadRequestError('x-reader-device-id header is required');
  }
  return deviceId;
}
