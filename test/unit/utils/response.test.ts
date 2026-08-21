import { success } from '@/utils/response';
import { describe, expect, it, vi } from 'vitest';

function reply() {
  const sent: { body?: unknown; status?: number } = {};
  const fake = {
    status: vi.fn((code: number) => {
      sent.status = code;
      return fake;
    }),
    send: vi.fn((body: unknown) => {
      sent.body = body;
      return fake;
    }),
  };
  return { fake, sent };
}

function bodyOf(data: unknown) {
  const { fake, sent } = reply();
  success(fake as never, 200, 'ok', 1000, data);
  return (sent.body as { data: Record<string, unknown> }).data;
}

describe('serialising a response', () => {
  /**
   * A Date has no enumerable own properties, so walking it as a plain object
   * produced `{}` — every timestamp reached the client as an empty object and
   * rendered as "NaN d ago".
   */
  it('sends a Date as an ISO string, not an empty object', () => {
    const createdAt = new Date('2026-08-20T22:00:00.000Z');

    expect(bodyOf({ createdAt })).toEqual({ createdAt: '2026-08-20T22:00:00.000Z' });
  });

  it('keeps a Date usable inside an array of rows', () => {
    const rows = [{ createdAt: new Date('2026-08-20T22:00:00.000Z') }];

    const data = bodyOf({ items: rows }) as { items: Array<{ createdAt: string }> };

    expect(Number.isNaN(new Date(data.items[0].createdAt).getTime())).toBe(false);
  });

  it('keeps a Date nested deeper down', () => {
    const data = bodyOf({ run: { step: { finishedAt: new Date('2026-08-20T22:00:00.000Z') } } });

    expect(data).toEqual({ run: { step: { finishedAt: '2026-08-20T22:00:00.000Z' } } });
  });

  it('still turns a BigInt into a string', () => {
    expect(bodyOf({ costMicroUsd: 1234n })).toEqual({ costMicroUsd: '1234' });
  });

  it('leaves null and undefined alone', () => {
    expect(bodyOf({ approvedAt: null, scheduledAt: undefined })).toEqual({
      approvedAt: null,
      scheduledAt: undefined,
    });
  });

  it('passes ordinary values through untouched', () => {
    expect(bodyOf({ topic: 'x', frames: 5, ok: true, tags: ['#a'] })).toEqual({
      topic: 'x',
      frames: 5,
      ok: true,
      tags: ['#a'],
    });
  });
});
