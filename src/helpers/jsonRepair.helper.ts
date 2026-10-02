const CONTROL_ESCAPES: Record<string, string> = {
  '\n': '\\n',
  '\r': '\\r',
  '\t': '\\t',
};

export function escapeControlCharsInStrings(json: string): string {
  let out = '';
  let inString = false;
  let escaped = false;

  for (const char of json) {
    if (!inString) {
      inString = char === '"';
      out += char;
      continue;
    }
    if (escaped) {
      escaped = false;
      out += char;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      out += char;
      continue;
    }
    if (char === '"') {
      inString = false;
      out += char;
      continue;
    }
    const code = char.charCodeAt(0);
    if (code < 0x20) {
      out += CONTROL_ESCAPES[char] ?? `\\u${code.toString(16).padStart(4, '0')}`;
      continue;
    }
    out += char;
  }

  return out;
}

export function parseLenientJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return JSON.parse(escapeControlCharsInStrings(text));
  }
}
