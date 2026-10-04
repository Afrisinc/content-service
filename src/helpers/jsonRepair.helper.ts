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

const CLOSES_STRING = new Set([',', '}', ']', ':']);

function nextVisible(json: string, from: number): string | undefined {
  for (let index = from; index < json.length; index += 1) {
    if (!/\s/.test(json[index])) {
      return json[index];
    }
  }
  return undefined;
}

export function escapeStrayQuotes(json: string): string {
  let out = '';
  let inString = false;
  let escaped = false;

  for (let index = 0; index < json.length; index += 1) {
    const char = json[index];
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
      const next = nextVisible(json, index + 1);
      if (next === undefined || CLOSES_STRING.has(next)) {
        inString = false;
        out += char;
      } else {
        out += '\\"';
      }
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
    const controlled = escapeControlCharsInStrings(text);
    try {
      return JSON.parse(controlled);
    } catch {
      return JSON.parse(escapeStrayQuotes(controlled));
    }
  }
}
