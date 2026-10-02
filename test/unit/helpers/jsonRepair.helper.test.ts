import { describe, expect, it } from 'vitest';
import { escapeControlCharsInStrings, parseLenientJson } from '@/helpers/jsonRepair.helper';

describe('escapeControlCharsInStrings', () => {
  it('escapes raw line breaks and tabs inside a string', () => {
    expect(escapeControlCharsInStrings('{"body":"one\ntwo\r\n\tthree"}')).toBe(
      '{"body":"one\\ntwo\\r\\n\\tthree"}'
    );
  });

  it('escapes other control characters as unicode', () => {
    expect(escapeControlCharsInStrings('{"a":"x\u0001y"}')).toBe('{"a":"x\\u0001y"}');
  });

  it('leaves whitespace between tokens alone', () => {
    const json = '{\n  "a": 1,\n\t"b": [1, 2]\n}';

    expect(escapeControlCharsInStrings(json)).toBe(json);
  });

  it('does not touch escapes that are already valid, including an escaped quote', () => {
    const json = '{"a":"line\\nbreak and \\"quoted\\" text \\\\"}';

    expect(escapeControlCharsInStrings(json)).toBe(json);
  });

  it('keeps tracking string boundaries after an escaped backslash', () => {
    expect(escapeControlCharsInStrings('{"a":"end\\\\","b":"x\ny"}')).toBe(
      '{"a":"end\\\\","b":"x\\ny"}'
    );
  });
});

describe('parseLenientJson', () => {
  it('parses valid JSON unchanged', () => {
    expect(parseLenientJson('{"a":"b\\nc"}')).toEqual({ a: 'b\nc' });
  });

  it('parses a string with raw line breaks, as a model writing prose produces', () => {
    expect(parseLenientJson('{"body":"First.\n\nSecond.","n":2}')).toEqual({
      body: 'First.\n\nSecond.',
      n: 2,
    });
  });

  it('still throws on JSON that is broken in some other way', () => {
    expect(() => parseLenientJson('{"a": ')).toThrow();
    expect(() => parseLenientJson('not json')).toThrow();
  });
});
