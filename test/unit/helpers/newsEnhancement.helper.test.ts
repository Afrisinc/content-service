import { describe, expect, it } from 'vitest';
import {
  buildEnhancementPrompt,
  countWords,
  coverPrompt,
  parseEnhancement,
  sanitizeArticleHtml,
  slugify,
} from '@/helpers/newsEnhancement.helper';

const source = {
  id: 42n,
  source_headline: 'Kenya opens M-Pesa API to regional banks',
  source_summary: 'Regulators agreed a shared licensing regime.',
  source_url: 'https://example.africa/kenya',
  category: 'Tech',
  creator: 'Disrupt Africa',
  pub_date: new Date('2026-09-21T10:00:00.000Z'),
};

const body = `<h2>Why it matters</h2><p>${'word '.repeat(200).trim()}</p>`;

const reply = (overrides: Record<string, unknown> = {}) => ({
  score: 0.82,
  should_publish: true,
  reject_reason: null,
  title: "M-Pesa's open API could reshape East African banking",
  slug: 'M-Pesa Open API!',
  excerpt: 'Regulators and banks line up behind one standard.',
  content: body,
  tags: ['#Fintech', 'fintech', 'Kenya'],
  category: 'Fintech',
  topic: 'finance',
  meta_title: 'M-Pesa open API',
  meta_description: 'What the new API means.',
  og_title: 'OG title',
  og_description: 'OG description',
  twitter_title: 'Tw title',
  twitter_description: 'Tw description',
  cover_alt: 'A banker using a phone',
  image_prompt: 'A Nairobi banking hall at dawn',
  ...overrides,
});

describe('buildEnhancementPrompt', () => {
  it('asks for strict JSON and passes every source field to the model', () => {
    const { systemPrompt, prompt } = buildEnhancementPrompt(source);

    expect(systemPrompt).toContain('Respond with ONLY a JSON object');
    expect(systemPrompt).toContain('Never invent facts');
    expect(prompt).toContain('Headline: Kenya opens M-Pesa API to regional banks');
    expect(prompt).toContain('Source: Disrupt Africa');
    expect(prompt).toContain('Published: 2026-09-21T10:00:00.000Z');
    expect(prompt).toContain('Original URL: https://example.africa/kenya');
  });

  it('marks missing source fields instead of sending "null"', () => {
    const { prompt } = buildEnhancementPrompt({
      ...source,
      source_headline: null,
      source_summary: null,
      creator: null,
      category: null,
      pub_date: null,
    });

    expect(prompt).toContain('Headline: (none)');
    expect(prompt).toContain('Source: unknown');
    expect(prompt).toContain('Feed category: general');
    expect(prompt).toContain('Published: unknown');
  });
});

describe('the standfirst', () => {
  const reply = {
    score: 0.8,
    should_publish: true,
    title: 'Kenya opens M-Pesa API',
    slug: 'kenya-mpesa-api',
    excerpt: 'A long excerpt of two or three sentences about the story.',
    meta_description: 'The SEO description of the story.',
    content: `<h2>Why</h2><p>${'word '.repeat(200)}</p>`,
  };

  it('is requested from the editor as a factual news deck', () => {
    const { systemPrompt } = buildEnhancementPrompt(source);

    expect(systemPrompt).toContain('"standfirst": "one factual sentence');
    expect(systemPrompt).toContain('No questions, no "discover", no promotional');
  });

  it('is taken from the editor when it wrote one', () => {
    const parsed = parseEnhancement(
      { ...reply, standfirst: 'Kenya has opened M-Pesa to banks.' },
      source
    );

    expect(parsed.standfirst).toBe('Kenya has opened M-Pesa to banks.');
  });

  it('falls back to the meta description when the editor left it out', () => {
    expect(parseEnhancement(reply, source).standfirst).toBe('The SEO description of the story.');
  });

  it('never exceeds what the news frame can carry', () => {
    const parsed = parseEnhancement({ ...reply, standfirst: 'x'.repeat(500) }, source);

    expect(parsed.standfirst.length).toBeLessThanOrEqual(160);
  });
});

describe('the cover instructions in the editor prompt', () => {
  it('forbid naming real organisations and asking for any text in the picture', () => {
    const { systemPrompt } = buildEnhancementPrompt(source);

    expect(systemPrompt).toContain('Never name a real company, institution, brand');
    expect(systemPrompt).toContain('never ask for signs, readable screens, captions or any text');
  });
});

describe('parseEnhancement', () => {
  it('returns a publishable article with normalised fields', () => {
    const article = parseEnhancement(reply(), source);

    expect(article).toMatchObject({
      score: 0.82,
      shouldPublish: true,
      rejectReason: null,
      slug: 'm-pesa-open-api',
      tags: ['Fintech', 'Kenya'],
      category: 'fintech',
      topic: 'finance',
      wordCount: 203,
      readTime: 2,
    });
  });

  it('fills SEO fields from the title and excerpt when the model leaves them out', () => {
    const article = parseEnhancement(
      reply({
        meta_title: '',
        meta_description: undefined,
        og_title: null,
        og_description: '',
        twitter_title: 3,
        twitter_description: '',
        cover_alt: '',
        image_prompt: '',
      }),
      source
    );

    expect(article.metaTitle).toBe(article.title.slice(0, 60));
    expect(article.metaDescription).toBe('Regulators and banks line up behind one standard.');
    expect(article.ogTitle).toBe(article.title);
    expect(article.ogDescription).toBe(article.metaDescription);
    expect(article.twitterTitle).toBe(article.title.slice(0, 70));
    expect(article.coverAlt).toBe(article.title);
    expect(article.imagePrompt).toContain(article.title);
  });

  it('falls back to the feed category, then to general', () => {
    expect(parseEnhancement(reply({ category: 'sport' }), source).category).toBe('tech');
    expect(
      parseEnhancement(reply({ category: 'sport' }), { ...source, category: null }).category
    ).toBe('general');
  });

  it('builds a slug from the title, then from the id, when the model gives none', () => {
    expect(parseEnhancement(reply({ slug: '' }), source).slug).toBe(
      'm-pesas-open-api-could-reshape-east-african-banking'
    );
    expect(parseEnhancement(reply({ slug: '', title: '!!!!!' }), source).slug).toBe('article-42');
  });

  it('returns a rejection with the model reason instead of throwing', () => {
    const article = parseEnhancement(
      reply({ score: 0.2, should_publish: false, reject_reason: 'Sport story', content: '' }),
      source
    );

    expect(article).toMatchObject({
      shouldPublish: false,
      rejectReason: 'Sport story',
      score: 0.2,
    });
  });

  it('treats a literal "null" reason as no reason', () => {
    expect(parseEnhancement(reply({ reject_reason: 'null' }), source).rejectReason).toBeNull();
  });

  it('accepts a numeric score sent as a string', () => {
    expect(parseEnhancement(reply({ score: '0.7' }), source).score).toBe(0.7);
  });

  it.each([null, 'text', [1, 2]])('rejects a reply that is not a JSON object (%s)', value => {
    expect(() => parseEnhancement(value, source)).toThrow(/JSON object/);
  });

  it.each([undefined, -0.1, 1.5, 'high'])('rejects an invalid score (%s)', score => {
    expect(() => parseEnhancement(reply({ score }), source)).toThrow(/relevance score/);
  });

  it('refuses to publish without a usable headline', () => {
    expect(() =>
      parseEnhancement(reply({ title: 'Hi' }), { ...source, source_headline: null })
    ).toThrow(/headline/);
  });

  it('refuses to publish an article that is too short', () => {
    expect(() => parseEnhancement(reply({ content: '<p>Too short.</p>' }), source)).toThrow(
      /too short \(2 words\)/
    );
  });

  it('ignores tags that are not strings and keeps at most eight', () => {
    const tags = Array.from({ length: 12 }, (_, index) => `tag${index}`);
    expect(parseEnhancement(reply({ tags: [...tags, 5, null] }), source).tags).toHaveLength(8);
    expect(parseEnhancement(reply({ tags: 'fintech' }), source).tags).toEqual([]);
  });
});

describe('sanitizeArticleHtml', () => {
  it('keeps formatting tags and drops their attributes', () => {
    expect(
      sanitizeArticleHtml('<h2 class="x" onclick="evil()">Title</h2><p style="c">Body</p>')
    ).toBe('<h2>Title</h2><p>Body</p>');
  });

  it('removes scripts, styles, iframes and comments with their contents', () => {
    expect(
      sanitizeArticleHtml(
        '<p>a</p><script>alert(1)</script><style>p{}</style>' +
          '<iframe src="x"></iframe><!-- hi --><p>b</p>'
      )
    ).toBe('<p>a</p><p>b</p>');
  });

  it('strips disallowed tags but keeps their text', () => {
    expect(sanitizeArticleHtml('<div><span>Kept</span></div><img src=x onerror=alert(1)>')).toBe(
      'Kept'
    );
  });

  it('keeps only http(s) links and adds a safe rel', () => {
    expect(sanitizeArticleHtml('<a href="https://afrisinc.com/x" target="_blank">ok</a>')).toBe(
      '<a href="https://afrisinc.com/x" rel="noopener noreferrer nofollow">ok</a>'
    );
    expect(sanitizeArticleHtml('<a href="javascript:alert(1)">bad</a>')).toBe('<a>bad</a>');
    expect(sanitizeArticleHtml('<a>no href</a>')).toBe('<a>no href</a>');
    expect(sanitizeArticleHtml('<a href="http://">broken</a>')).toBe('<a>broken</a>');
  });

  it('drops closing br tags and escapes a stray angle bracket', () => {
    expect(sanitizeArticleHtml('<p>a<br>b</br> 3 < 5</p>')).toBe('<p>a<br>b 3 &lt; 5</p>');
  });
});

describe('slugify and countWords', () => {
  it('produces an ascii kebab-case slug within the limit', () => {
    expect(slugify('  Café — Lagos: 2026 Plan!  ')).toBe('cafe-lagos-2026-plan');
    expect(slugify('a'.repeat(80), 10)).toBe('aaaaaaaaaa');
  });

  it('counts words outside markup', () => {
    expect(countWords('<p>One two</p><p>three</p>')).toBe(3);
    expect(countWords('<p></p>')).toBe(0);
  });
});

describe('coverPrompt', () => {
  it('keeps the model prompt and forbids any lettering, signage or logos in the picture', () => {
    const prompt = coverPrompt('  A Nairobi banking hall at dawn  ');

    expect(prompt.startsWith('A Nairobi banking hall at dawn')).toBe(true);
    expect(prompt).toContain('no text, lettering, numbers, signage, logos, seals or watermarks');
    expect(prompt).toContain('blank or show abstract shapes only');
  });
});
