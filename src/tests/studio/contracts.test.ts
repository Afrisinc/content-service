import { describe, expect, it } from 'vitest';
import { sceneSpecSchema, storySchema } from '@/studio/contracts';

function narration(id: string) {
  return { line_id: id, text: 'a line of narration', emotion: 'neutral' };
}

function storyScene(index: number, beat: string, duration: number) {
  return {
    scene_id: `scene_${String(index).padStart(3, '0')}`,
    index,
    beat,
    synopsis: 'something happens that moves the story forward',
    environment_id: 'village_v1',
    character_ids: ['david_v1'],
    duration_seconds: duration,
    narration: [narration(`line_${index}`)],
    dialogue: [],
    transition_in: 'cut',
    transition_out: 'cut',
    sfx: [],
  };
}

function story(overrides: Record<string, unknown> = {}) {
  return {
    story_id: 'story_1',
    title: 'The Little Bird',
    logline: 'A boy finds an injured bird and helps it fly again.',
    synopsis: 'A boy walking home finds an injured bird, cares for it, and releases it.',
    genre: 'drama',
    language: 'en',
    themes: ['kindness'],
    target_duration_seconds: 30,
    character_slugs: ['david'],
    environment_slugs: ['village'],
    scenes: [
      storyScene(0, 'setup', 10),
      storyScene(1, 'climax', 10),
      storyScene(2, 'resolution', 10),
    ],
    ...overrides,
  };
}

function shot(
  id: string,
  index: number,
  duration: number,
  overrides: Record<string, unknown> = {}
) {
  return {
    shot_id: id,
    index,
    duration_seconds: duration,
    camera: {
      shot_size: 'medium',
      lens_mm: 50,
      depth_of_field: false,
      movement: { type: 'static', amount: 0, easing: 'ease_in_out' },
    },
    characters: [],
    props: [],
    audio: { narration_track_ids: [], dialogue_track_ids: [], sfx: [] },
    transition_out: 'cut',
    ...overrides,
  };
}

function scene(overrides: Record<string, unknown> = {}) {
  return {
    scene_id: 'scene_000',
    index: 0,
    duration_seconds: 6,
    environment_id: 'village_v1',
    animation_mode: '3d',
    shots: [shot('shot_000', 0, 3), shot('shot_001', 1, 3)],
    ...overrides,
  };
}

describe('storySchema', () => {
  it('accepts a story whose scene durations match the target', () => {
    const parsed = storySchema.safeParse(story());
    expect(parsed.success).toBe(true);
  });

  it('rejects scene durations that drift beyond fifteen percent of the target', () => {
    const parsed = storySchema.safeParse(story({ target_duration_seconds: 120 }));
    expect(parsed.success).toBe(false);
    expect(JSON.stringify(parsed.error?.issues)).toContain('scene durations total');
  });

  it('rejects a story with no climax beat', () => {
    const scenes = [storyScene(0, 'setup', 15), storyScene(1, 'resolution', 15)];
    const parsed = storySchema.safeParse(story({ scenes }));
    expect(parsed.success).toBe(false);
    expect(JSON.stringify(parsed.error?.issues)).toContain('no climax beat');
  });

  it('rejects a scene index that does not match its position', () => {
    const scenes = [
      storyScene(0, 'setup', 10),
      storyScene(5, 'climax', 10),
      storyScene(2, 'resolution', 10),
    ];
    const parsed = storySchema.safeParse(story({ scenes }));
    expect(parsed.success).toBe(false);
    expect(JSON.stringify(parsed.error?.issues)).toContain('does not match its position');
  });

  it('rejects duplicate scene ids', () => {
    const duplicate = { ...storyScene(0, 'climax', 10), index: 1 };
    const scenes = [storyScene(0, 'setup', 10), duplicate, storyScene(2, 'resolution', 10)];
    const parsed = storySchema.safeParse(story({ scenes }));
    expect(parsed.success).toBe(false);
    expect(JSON.stringify(parsed.error?.issues)).toContain('duplicate scene_id');
  });

  it('rejects a story with no characters', () => {
    expect(storySchema.safeParse(story({ character_slugs: [] })).success).toBe(false);
  });
});

describe('sceneSpecSchema', () => {
  it('accepts shots that sum to the scene duration', () => {
    expect(sceneSpecSchema.safeParse(scene()).success).toBe(true);
  });

  it('rejects shots that do not sum to the scene duration', () => {
    const parsed = sceneSpecSchema.safeParse(scene({ duration_seconds: 30 }));
    expect(parsed.success).toBe(false);
    expect(JSON.stringify(parsed.error?.issues)).toContain('shot durations total');
  });

  it('rejects an animation that runs past the end of its shot', () => {
    const speaking = shot('shot_000', 0, 3, {
      characters: [
        {
          character_id: 'david_v1',
          emotion: 'curious',
          animations: [
            {
              character_id: 'david_v1',
              action: 'walk',
              start_time: 2,
              duration: 4,
              speed: 1,
              loop: false,
            },
          ],
        },
      ],
    });
    const parsed = sceneSpecSchema.safeParse(scene({ shots: [speaking, shot('shot_001', 1, 3)] }));
    expect(parsed.success).toBe(false);
    expect(JSON.stringify(parsed.error?.issues)).toContain('runs past the end of');
  });

  it('rejects an unknown animation action', () => {
    const bad = shot('shot_000', 0, 3, {
      characters: [
        {
          character_id: 'david_v1',
          emotion: 'neutral',
          animations: [
            {
              character_id: 'david_v1',
              action: 'moonwalk',
              start_time: 0,
              duration: 1,
              speed: 1,
              loop: false,
            },
          ],
        },
      ],
    });
    expect(sceneSpecSchema.safeParse(scene({ shots: [bad, shot('shot_001', 1, 3)] })).success).toBe(
      false
    );
  });

  it('rejects a shot index out of order', () => {
    const parsed = sceneSpecSchema.safeParse(
      scene({ shots: [shot('shot_000', 3, 3), shot('shot_001', 1, 3)] })
    );
    expect(parsed.success).toBe(false);
    expect(JSON.stringify(parsed.error?.issues)).toContain('does not match its position');
  });

  it('rejects a scene with no shots', () => {
    expect(sceneSpecSchema.safeParse(scene({ shots: [] })).success).toBe(false);
  });

  it('applies the static camera default when movement is omitted', () => {
    const withoutMovement = {
      ...shot('shot_000', 0, 6),
      camera: { shot_size: 'wide', lens_mm: 35, depth_of_field: false },
    };
    const parsed = sceneSpecSchema.safeParse(scene({ shots: [withoutMovement] }));
    expect(parsed.success).toBe(true);
    expect(parsed.data?.shots[0].camera.movement.type).toBe('static');
  });
});
