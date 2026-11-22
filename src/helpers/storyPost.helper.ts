import type { Story, StoryEpisode } from '@prisma/client';
import { standfirstFrom } from '@/helpers/newsPost.helper';
import type { EditorialBrief } from '@/types/post.types';

const MAX_TITLE_IN_DATELINE = 44;
const MAX_HASHTAGS = 5;

function shortTitle(title: string): string {
  const clean = title.replace(/\s+/g, ' ').trim();
  return clean.length > MAX_TITLE_IN_DATELINE
    ? `${clean.slice(0, MAX_TITLE_IN_DATELINE - 1).trimEnd()}…`
    : clean;
}

export function storyEditorial(
  story: Pick<Story, 'title'>,
  episode: Pick<
    StoryEpisode,
    'episodeNumber' | 'title' | 'hook' | 'promotionCaption' | 'promotionHashtags'
  >,
  url: string
): EditorialBrief {
  const hashtags = episode.promotionHashtags.slice(0, MAX_HASHTAGS);

  return {
    layout: 'story',
    headline: episode.title,
    standfirst: standfirstFrom(episode.hook),
    eyebrow: `EPISODE ${episode.episodeNumber}`,
    dateline: `${shortTitle(story.title)} · Episode ${episode.episodeNumber}`,
    caption: [
      (episode.promotionCaption ?? episode.hook).trim(),
      `Read episode ${episode.episodeNumber}: ${url}`,
      `Follow so you don't miss episode ${episode.episodeNumber + 1}, and save this to catch up.`,
      hashtags.join(' '),
    ]
      .filter(Boolean)
      .join('\n\n'),
    hashtags,
  };
}
