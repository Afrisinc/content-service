import { describe, expect, it } from 'vitest';
import {
  escapeControlCharsInStrings,
  escapeStrayQuotes,
  parseLenientJson,
} from '@/helpers/jsonRepair.helper';

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

describe('escapeStrayQuotes', () => {
  it('escapes a quote inside dialogue that the model left bare', () => {
    expect(escapeStrayQuotes('{"body":"She said "hello" and left."}')).toBe(
      '{"body":"She said \\"hello\\" and left."}'
    );
  });

  it('keeps the quotes that really open and close strings', () => {
    const json = '{"a": "one", "b": ["two", "three"], "c": {"d": "four"}}';

    expect(escapeStrayQuotes(json)).toBe(json);
  });

  it('leaves quotes that are already escaped alone', () => {
    const json = '{"a":"say \\"hi\\" now"}';

    expect(escapeStrayQuotes(json)).toBe(json);
  });

  it('treats a quote before whitespace and a closing brace as the end of the string', () => {
    expect(escapeStrayQuotes('{"a":"done"\n}')).toBe('{"a":"done"\n}');
  });
});

describe('parseLenientJson with stray quotes', () => {
  it('reads an episode whose dialogue broke the JSON, with line breaks too', () => {
    expect(parseLenientJson('{"body":"He whispered "run".\n\nShe ran.","n":1}')).toEqual({
      body: 'He whispered "run".\n\nShe ran.',
      n: 1,
    });
  });

  it('still fails when a stray quote sits right before a comma, rather than guessing', () => {
    expect(() => parseLenientJson('{"body":"He said "hi", then left."}')).toThrow();
  });
});
