import { XMLParser } from 'fast-xml-parser';

export interface NewsSource {
  name: string;
  url: string;
  category: string;
}

export interface FeedItem {
  guid: string;
  title: string;
  link: string;
  summary: string | null;
  imageUrl: string | null;
  publishedAt: Date | null;
  category: string | null;
  author: string | null;
}

export const DEFAULT_NEWS_SOURCES: NewsSource[] = [
  {
    name: 'BBC Africa',
    url: 'https://feeds.bbci.co.uk/news/world/africa/rss.xml',
    category: 'news',
  },
  { name: 'Disrupt Africa', url: 'https://disrupt-africa.com/feed/', category: 'tech' },
  { name: 'TechCabal', url: 'https://techcabal.com/feed/', category: 'tech' },
  {
    name: 'TechCrunch Africa',
    url: 'https://techcrunch.com/tag/africa/feed/',
    category: 'startup',
  },
  { name: 'African Business', url: 'https://african.business/feed/', category: 'business' },
  { name: 'Ventureburn', url: 'https://ventureburn.com/feed/', category: 'startup' },
  { name: 'The Africa Report', url: 'https://www.theafricareport.com/feed/', category: 'news' },
  { name: 'Africanews', url: 'https://www.africanews.com/feed/', category: 'news' },
  { name: 'BusinessDay', url: 'https://businessday.ng/feed/', category: 'business' },
  {
    name: 'AllAfrica',
    url: 'https://allafrica.com/tools/headlines/rdf/latest/headlines.rdf',
    category: 'general',
  },
  {
    name: 'GNews Africa Finance',
    url: 'https://news.google.com/rss/search?q=africa+finance&hl=en&gl=ZA&ceid=ZA:en',
    category: 'finance',
  },
  {
    name: 'GNews Africa Business',
    url: 'https://news.google.com/rss/search?q=africa+business&hl=en&gl=ZA&ceid=ZA:en',
    category: 'business',
  },
  {
    name: 'GNews Africa Tech',
    url: 'https://news.google.com/rss/search?q=africa+technology&hl=en&gl=ZA&ceid=ZA:en',
    category: 'tech',
  },
];

const LIMITS = { guid: 2000, title: 500, link: 2000, summary: 5000 } as const;

const TRACKING_PARAM = /^(utm_\w+|at_\w+|fbclid|gclid|mc_cid|mc_eid|ocid|oc|ref|cmpid)$/i;

const HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  cdataPropName: false,
  trimValues: true,
  parseTagValue: false,
  processEntities: true,
  htmlEntities: true,
});

type XmlNode = unknown;

type Entries = Record<string, unknown> | Record<string, unknown>[];

interface FeedDocument {
  rss?: { channel?: { item?: Entries } | { item?: Entries }[] };
  'rdf:RDF'?: { item?: Entries };
  feed?: { entry?: Entries };
}

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function text(node: XmlNode): string {
  if (node === undefined || node === null) {
    return '';
  }
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node).trim();
  }
  if (Array.isArray(node)) {
    return text(node[0]);
  }
  if (typeof node === 'object') {
    const record = node as Record<string, unknown>;
    if ('#text' in record) {
      return text(record['#text']);
    }
    if ('@_term' in record) {
      return text(record['@_term']);
    }
  }
  return '';
}

function attr(node: XmlNode, name: string): string {
  const first = Array.isArray(node) ? node[0] : node;
  if (first && typeof first === 'object') {
    const value = (first as Record<string, unknown>)[`@_${name}`];
    return typeof value === 'string' ? value.trim() : '';
  }
  return '';
}

function decodeEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_m, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name: string) => HTML_ENTITIES[name.toLowerCase()] ?? match);
}

export function stripHtml(value: string): string {
  return decodeEntities(
    value
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

/**
 * Removes campaign and tracking parameters only. Stripping the whole query (as
 * the old n8n flow did) breaks sites whose permalink *is* a query string, like
 * WordPress's `?p=123`.
 */
export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    for (const key of [...parsed.searchParams.keys()]) {
      if (TRACKING_PARAM.test(key)) {
        parsed.searchParams.delete(key);
      }
    }
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return url;
  }
}

function parseDate(value: string): Date | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function firstImageInHtml(html: string): string | null {
  const match = /<img[^>]+src=["']([^"']+)["']/i.exec(html);
  return match ? match[1] : null;
}

function imageFrom(entry: Record<string, unknown>, html: string): string | null {
  const media = asArray(entry['media:content']).find(node => {
    const medium = attr(node, 'medium');
    const type = attr(node, 'type');
    return medium === 'image' || type.startsWith('image/') || (!medium && !type);
  });
  const enclosure = asArray(entry.enclosure).find(node => attr(node, 'type').startsWith('image/'));

  return (
    attr(media, 'url') ||
    attr(entry['media:thumbnail'], 'url') ||
    attr(enclosure, 'url') ||
    firstImageInHtml(html) ||
    null
  );
}

function atomLink(entry: Record<string, unknown>): string {
  const links = asArray(entry.link);
  const alternate = links.find(node => !attr(node, 'rel') || attr(node, 'rel') === 'alternate');
  return attr(alternate ?? links[0], 'href') || text(links[0]);
}

function toItem(entry: Record<string, unknown>, isAtom: boolean): FeedItem | null {
  const title = stripHtml(text(entry.title));
  const rawLink = isAtom ? atomLink(entry) : text(entry.link);
  const link = rawLink ? normalizeUrl(rawLink) : '';
  const guid = text(isAtom ? entry.id : entry.guid) || link;

  if (!title || !guid) {
    return null;
  }

  const html =
    text(entry['content:encoded']) ||
    text(entry.description) ||
    text(entry.summary) ||
    text(entry.content);
  const summary = stripHtml(html);
  const author =
    text(entry['dc:creator']) ||
    text(entry.author) ||
    text((entry.author as { name?: unknown })?.name);

  return {
    guid: guid.slice(0, LIMITS.guid),
    title: title.slice(0, LIMITS.title),
    link: (link || guid).slice(0, LIMITS.link),
    summary: summary ? summary.slice(0, LIMITS.summary) : null,
    imageUrl: imageFrom(entry, html),
    publishedAt: parseDate(
      text(entry.pubDate) || text(entry.published) || text(entry.updated) || text(entry['dc:date'])
    ),
    category: text(entry.category) || null,
    author: author || null,
  };
}

/** RSS 2.0, RDF/RSS 1.0 and Atom. Throws when the document is none of them. */
export function parseFeed(xml: string, limit = Number.POSITIVE_INFINITY): FeedItem[] {
  const document = parser.parse(xml) as FeedDocument;

  let entries: Record<string, unknown>[];
  let isAtom = false;

  if (document.rss?.channel) {
    entries = asArray(asArray(document.rss.channel)[0]?.item);
  } else if (document['rdf:RDF']) {
    entries = asArray(document['rdf:RDF'].item);
  } else if (document.feed) {
    entries = asArray(document.feed.entry);
    isAtom = true;
  } else {
    throw new Error('not an RSS, RDF or Atom feed');
  }

  const items: FeedItem[] = [];
  for (const entry of entries) {
    if (items.length >= limit) {
      break;
    }
    const item = toItem(entry, isAtom);
    if (item) {
      items.push(item);
    }
  }
  return items;
}

function isSource(value: unknown): value is NewsSource {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const source = value as Record<string, unknown>;
  return (
    typeof source.name === 'string' &&
    source.name.trim() !== '' &&
    typeof source.url === 'string' &&
    /^https?:\/\//i.test(source.url) &&
    typeof source.category === 'string'
  );
}

/** A JSON override from config wins; anything malformed falls back to the built-in list. */
export function resolveNewsSources(override: string): NewsSource[] {
  if (!override.trim()) {
    return DEFAULT_NEWS_SOURCES;
  }

  try {
    const parsed: unknown = JSON.parse(override);
    const sources = Array.isArray(parsed) ? parsed.filter(isSource) : [];
    return sources.length > 0 ? sources : DEFAULT_NEWS_SOURCES;
  } catch {
    return DEFAULT_NEWS_SOURCES;
  }
}
