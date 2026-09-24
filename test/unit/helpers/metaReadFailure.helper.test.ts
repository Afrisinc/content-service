import { describe, expect, it } from 'vitest';
import {
  classifyMetaError,
  isFieldLevelFailure,
  tallyFailure,
  type MetaFailureTally,
} from '@/helpers/metaReadFailure.helper';

const error = (fields: {
  status?: number | null;
  code?: number | null;
  subcode?: number | null;
}) => ({
  status: 400,
  code: null,
  subcode: null,
  message: '',
  ...fields,
});

describe('classifyMetaError', () => {
  it.each([
    [{ code: 190 }, 'token'],
    [{ code: 102 }, 'token'],
    [{ status: 401 }, 'token'],
    [{ code: 4 }, 'rate_limit'],
    [{ code: 17 }, 'rate_limit'],
    [{ code: 32 }, 'rate_limit'],
    [{ code: 613 }, 'rate_limit'],
    [{ code: 80001 }, 'rate_limit'],
    [{ status: 429 }, 'rate_limit'],
    [{ code: 10 }, 'permission'],
    [{ code: 200 }, 'permission'],
    [{ code: 299 }, 'permission'],
    [{ code: 100, subcode: 33 }, 'missing'],
    [{ code: 803 }, 'missing'],
    [{ status: null }, 'unavailable'],
    [{ status: 503 }, 'unavailable'],
    [{ code: 2 }, 'unavailable'],
    [{ code: 100 }, 'other'],
  ] as const)('reads %o as %s', (fields, kind) => {
    expect(classifyMetaError(error(fields))).toBe(kind);
  });
});

describe('isFieldLevelFailure', () => {
  it('only lets field-level failures fall back to a smaller field set', () => {
    expect(isFieldLevelFailure('permission')).toBe(true);
    expect(isFieldLevelFailure('other')).toBe(true);
    expect(isFieldLevelFailure('token')).toBe(false);
    expect(isFieldLevelFailure('rate_limit')).toBe(false);
    expect(isFieldLevelFailure('missing')).toBe(false);
    expect(isFieldLevelFailure('unavailable')).toBe(false);
  });
});

describe('tallyFailure', () => {
  it('counts each kind', () => {
    const tally: MetaFailureTally = {};
    tallyFailure(tally, 'token');
    tallyFailure(tally, 'token');
    tallyFailure(tally, 'missing');
    expect(tally).toEqual({ token: 2, missing: 1 });
  });
});
