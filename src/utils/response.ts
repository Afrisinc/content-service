import { FastifyReply } from 'fastify';

export const success = (reply: FastifyReply, code: number, message: string, data?: any) =>
  reply.status(code).send({ success: true, message, data });

export const error = (reply: FastifyReply, code: number, message: string) =>
  reply.status(code).send({ success: false, message });
