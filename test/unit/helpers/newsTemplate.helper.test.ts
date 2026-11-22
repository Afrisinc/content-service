import { describe, expect, it } from 'vitest';
import {
  newsTemplateCandidates,
  newsTemplatePool,
  templateProbe,
} from '@/helpers/newsTemplate.helper';

describe('newsTemplatePool', () => {
  it.each([
    ['Breaking', 'news.bulletin'],
    ['Football', 'news.spotlight'],
    ['Fintech', 'news.frame'],
    ['Politics', 'news.classic'],
    [undefined, 'news.classic'],
  ])('%s starts from a matching pool', (category, first) => {
    expect(newsTemplatePool(category)[0]).toBe(first);
  });

  it('keeps the live-news poster for breaking stories only', () => {
    expect(newsTemplatePool('Breaking')).toContain('news.breaking');
    expect(newsTemplatePool('Politics')).not.toContain('news.breaking');
  });
});

describe('newsTemplateCandidates', () => {
  it('is the whole pool, rotated', () => {
    const pool = newsTemplatePool('Politics');
    const candidates = newsTemplateCandidates('Politics', 'some-story');

    expect([...candidates].sort()).toEqual([...pool].sort());
  });

  it('is stable for one slug', () => {
    expect(newsTemplateCandidates('Politics', 'a')).toEqual(
      newsTemplateCandidates('Politics', 'a')
    );
  });

  it('reaches every template in a pool across stories', () => {
    const firsts = new Set(
      Array.from(
        { length: 60 },
        (_, index) => newsTemplateCandidates('Politics', `story-${index}`)[0]
      )
    );

    expect(firsts).toEqual(new Set(newsTemplatePool('Politics')));
  });

  it('covers all eight templates across the pools', () => {
    const all = new Set(
      ['Breaking', 'Football', 'Fintech', 'Politics'].flatMap(category =>
        newsTemplatePool(category)
      )
    );

    expect(all.size).toBe(8);
  });
});

describe('templateProbe', () => {
  it('asks the renderer to fit the headline and standfirst for that template', () => {
    expect(templateProbe('news.split', ['A', 'B'], 'Stand')).toEqual({
      layout: 'news',
      template: 'news.split',
      headline: ['A', 'B'],
      subs: ['Stand'],
    });
  });

  it('leaves out an empty standfirst', () => {
    expect(templateProbe('news.split', ['A'], undefined)).not.toHaveProperty('subs');
  });
});
