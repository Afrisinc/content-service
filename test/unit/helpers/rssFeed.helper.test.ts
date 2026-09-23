import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NEWS_SOURCES,
  normalizeUrl,
  parseFeed,
  resolveNewsSources,
  stripHtml,
} from '@/helpers/rssFeed.helper';

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:media="http://search.yahoo.com/mrss/"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Techpoint Africa</title>
    <item>
      <title><![CDATA[Lagos fintech &amp; the corridor]]></title>
      <link>https://techpoint.africa/2026/09/22/lagos/?utm_source=rss&amp;at_medium=feed</link>
      <guid isPermaLink="false">tp-123</guid>
      <pubDate>Tue, 22 Sep 2026 08:30:00 GMT</pubDate>
      <description><![CDATA[<p>Founders are <b>rebuilding</b> rails.</p><img src="x.jpg"/>]]>
      </description>
      <dc:creator>Ada Obi</dc:creator>
      <category>Fintech</category>
      <media:content url="https://cdn.tp/cover.jpg" medium="image"/>
    </item>
    <item>
      <title>WordPress permalink</title>
      <link>https://example.africa/?p=987&amp;utm_campaign=x</link>
      <description>Plain summary</description>
      <enclosure url="https://example.africa/audio.mp3" type="audio/mpeg"/>
    </item>
    <item>
      <description>No title, so it is dropped</description>
      <link>https://example.africa/none</link>
    </item>
  </channel>
</rss>`;

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">
  <entry>
    <title type="html">Kenya opens its &lt;b&gt;API&lt;/b&gt;</title>
    <link rel="self" href="https://example.africa/self"/>
    <link rel="alternate" href="https://example.africa/kenya-api#comments"/>
    <id>urn:uuid:kenya-api</id>
    <updated>2026-09-21T10:00:00Z</updated>
    <summary>Regulators agree.</summary>
    <author><name>Wanjiru K</name></author>
    <category term="Policy"/>
    <media:thumbnail url="https://example.africa/thumb.jpg"/>
  </entry>
</feed>`;

const RDF = `<?xml version="1.0"?>
<rdf:RDF
  xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
  xmlns="http://purl.org/rss/1.0/"
  xmlns:dc="http://purl.org/dc/elements/1.1/">
  <item rdf:about="https://allafrica.com/stories/1.html">
    <title>Ghana cedi steadies</title>
    <link>https://allafrica.com/stories/1.html</link>
    <description>Markets calm.</description>
    <dc:date>2026-09-20T06:00:00+00:00</dc:date>
  </item>
</rdf:RDF>`;

describe('parseFeed', () => {
  it('reads RSS 2.0 items, unwrapping CDATA and decoding entities', () => {
    const [item] = parseFeed(RSS);

    expect(item).toEqual({
      guid: 'tp-123',
      title: 'Lagos fintech & the corridor',
      link: 'https://techpoint.africa/2026/09/22/lagos/',
      summary: 'Founders are rebuilding rails.',
      imageUrl: 'https://cdn.tp/cover.jpg',
      publishedAt: new Date('2026-09-22T08:30:00.000Z'),
      category: 'Fintech',
      author: 'Ada Obi',
    });
  });

  it('keeps a query permalink, uses the link as guid and ignores audio enclosures', () => {
    const item = parseFeed(RSS)[1];

    expect(item.link).toBe('https://example.africa/?p=987');
    expect(item.guid).toBe('https://example.africa/?p=987');
    expect(item.imageUrl).toBeNull();
    expect(item.publishedAt).toBeNull();
  });

  it('drops items without a title', () => {
    expect(parseFeed(RSS)).toHaveLength(2);
  });

  it('stops at the item limit', () => {
    expect(parseFeed(RSS, 1)).toHaveLength(1);
  });

  it('reads Atom entries using the alternate link and the entry id', () => {
    const [entry] = parseFeed(ATOM);

    expect(entry).toMatchObject({
      guid: 'urn:uuid:kenya-api',
      title: 'Kenya opens its API',
      link: 'https://example.africa/kenya-api',
      summary: 'Regulators agree.',
      imageUrl: 'https://example.africa/thumb.jpg',
      category: 'Policy',
      author: 'Wanjiru K',
    });
    expect(entry.publishedAt?.toISOString()).toBe('2026-09-21T10:00:00.000Z');
  });

  it('reads RDF (RSS 1.0) items with Dublin Core dates', () => {
    const [item] = parseFeed(RDF);

    expect(item).toMatchObject({
      title: 'Ghana cedi steadies',
      guid: 'https://allafrica.com/stories/1.html',
    });
    expect(item.publishedAt?.toISOString()).toBe('2026-09-20T06:00:00.000Z');
  });

  it('takes the first inline image when the item has no media element', () => {
    const xml = `<rss><channel><item><title>T</title><link>https://a.africa/x</link>
      <description><![CDATA[<p>x</p><img src="https://a.africa/i.png">]]></description>
      </item></channel></rss>`;

    expect(parseFeed(xml)[0].imageUrl).toBe('https://a.africa/i.png');
  });

  it('handles repeated tags, bare media, text links, numeric titles and bad dates', () => {
    const xml = `<rss><channel><item>
      <title>2026</title>
      <guid>only-guid</guid>
      <category>Tech</category><category>Money</category>
      <pubDate>not a date</pubDate>
      <media:content url="https://a.africa/bare.jpg"/>
    </item></channel></rss>`;

    expect(parseFeed(xml)[0]).toMatchObject({
      title: '2026',
      guid: 'only-guid',
      link: 'only-guid',
      category: 'Tech',
      publishedAt: null,
      imageUrl: 'https://a.africa/bare.jpg',
    });
  });

  it('reads an Atom link written as text and an author written as text', () => {
    const xml = `<feed><entry><title>X</title><id>x-1</id><link>https://a.africa/x</link>
      <author>Plain Name</author></entry></feed>`;

    expect(parseFeed(xml)[0]).toMatchObject({
      link: 'https://a.africa/x',
      author: 'Plain Name',
    });
  });

  it('rejects a document that is not a feed', () => {
    expect(() => parseFeed('<html><body>Not a feed</body></html>')).toThrow(/not an RSS/);
  });
});

describe('stripHtml', () => {
  it('drops tags, scripts and styles and decodes common entities', () => {
    expect(
      stripHtml(
        '<p>A &amp; B&nbsp;&#8212; &#x2019;s</p><script>alert(1)</script><style>p{}</style>'
      )
    ).toBe('A & B — ’s');
  });

  it('keeps unknown entities as written', () => {
    expect(stripHtml('Fish &unknown; chips')).toBe('Fish &unknown; chips');
  });
});

describe('normalizeUrl', () => {
  it('removes tracking parameters and the fragment only', () => {
    expect(normalizeUrl('https://a.africa/x?id=7&utm_medium=rss&fbclid=abc#top')).toBe(
      'https://a.africa/x?id=7'
    );
  });

  it('returns an unparseable value unchanged', () => {
    expect(normalizeUrl('not a url')).toBe('not a url');
  });
});

describe('resolveNewsSources', () => {
  it('uses the built-in list when nothing is configured', () => {
    expect(resolveNewsSources('')).toBe(DEFAULT_NEWS_SOURCES);
  });

  it('uses a valid configured list, dropping malformed entries', () => {
    const configured = JSON.stringify([
      { name: 'Only', url: 'https://only.africa/feed', category: 'tech' },
      { name: 'Bad', url: 'ftp://nope', category: 'tech' },
      { name: '', url: 'https://x.africa', category: 'tech' },
      'nonsense',
    ]);

    expect(resolveNewsSources(configured)).toEqual([
      { name: 'Only', url: 'https://only.africa/feed', category: 'tech' },
    ]);
  });

  it.each(['{not json', '[]', '{"name":"x"}'])('falls back to the built-in list for %s', value => {
    expect(resolveNewsSources(value)).toBe(DEFAULT_NEWS_SOURCES);
  });
});
