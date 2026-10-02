import { describe, expect, it } from 'vitest';
import { storyEditorial } from '@/helpers/storyPost.helper';

const story = { title: 'Static' };
const episode = {
  episodeNumber: 3,
  title: 'The Voice Knows Her Name',
  hook: 'A dead channel starts broadcasting a voice no one sent.',
  promotionCaption: 'A signal that should not exist just said her name.',
  promotionHashtags: ['#fiction', '#story'],
};
const URL = 'https://afrisinc.com/media/stories/story-1/episodes/3';

describe('storyEditorial', () => {
  it('is a story frame with the episode tag, title, hook and the story in the dateline', () => {
    expect(storyEditorial(story, episode, URL)).toEqual({
      layout: 'story',
      headline: 'The Voice Knows Her Name',
      standfirst: 'A dead channel starts broadcasting a voice no one sent.',
      eyebrow: 'EPISODE 3',
      dateline: 'Static · Episode 3',
      caption: [
        'A signal that should not exist just said her name.',
        `Read episode 3: ${URL}`,
        '#fiction #story',
      ].join('\n\n'),
      hashtags: ['#fiction', '#story'],
    });
  });

  it('writes the caption from the hook when the episode has no promotion caption', () => {
    const { caption } = storyEditorial(story, { ...episode, promotionCaption: null }, URL);

    expect(caption.startsWith(episode.hook)).toBe(true);
  });

  it('leaves the hashtag line out when there are none', () => {
    const { caption, hashtags } = storyEditorial(story, { ...episode, promotionHashtags: [] }, URL);

    expect(hashtags).toEqual([]);
    expect(caption).toBe(`${episode.promotionCaption}\n\nRead episode 3: ${URL}`);
  });

  it('keeps no more than five hashtags', () => {
    const many = ['#a', '#b', '#c', '#d', '#e', '#f', '#g'];

    expect(storyEditorial(story, { ...episode, promotionHashtags: many }, URL).hashtags).toEqual(
      many.slice(0, 5)
    );
  });

  it('shortens a long story title so the dateline stays within the renderer limit', () => {
    const { dateline } = storyEditorial({ title: 'T'.repeat(120) }, episode, URL);

    expect(dateline.length).toBeLessThanOrEqual(80);
    expect(dateline).toContain('… · Episode 3');
  });

  it('shortens a long hook to a standfirst that fits the frame', () => {
    const { standfirst } = storyEditorial(story, { ...episode, hook: 'word '.repeat(80) }, URL);

    expect(standfirst.length).toBeLessThanOrEqual(161);
  });
});
