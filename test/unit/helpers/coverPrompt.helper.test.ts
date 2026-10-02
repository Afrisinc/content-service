import { describe, expect, it } from 'vitest';
import { IMAGE_SAFETY_RULES, storyCoverPrompt, withImageRules } from '@/helpers/coverPrompt.helper';

describe('withImageRules', () => {
  it('keeps the prompt and adds the style and the safety rules after it', () => {
    expect(withImageRules('Editorial photograph.', '  A busy street  ')).toBe(
      `A busy street\n\nEditorial photograph. ${IMAGE_SAFETY_RULES}`
    );
  });

  it('forbids text, logos and faces in every image', () => {
    expect(IMAGE_SAFETY_RULES).toContain('no text, lettering, numbers, signage, logos');
    expect(IMAGE_SAFETY_RULES).toContain('no face in close-up or in profile');
    expect(IMAGE_SAFETY_RULES).toContain('Prefer a composition with no people');
  });
});

describe('storyCoverPrompt', () => {
  const story = {
    premise: 'A radio operator hears a voice from a station that went dark decades ago.',
    genre: 'mystery',
    tone: 'eerie, patient',
  };

  it('describes a symbolic scene from the premise as a book cover', () => {
    const prompt = storyCoverPrompt(story);

    expect(prompt).toContain('A cover for a mystery story.');
    expect(prompt).toContain('Mood: mystery, eerie, patient.');
    expect(prompt).toContain('without naming anything in it: A radio operator hears a voice');
    expect(prompt).toContain('Cinematic book-cover illustration');
    expect(prompt).toContain('space at the top and bottom for a title');
  });

  it('ends with the safety rules so the cover has no lettering or faces', () => {
    expect(storyCoverPrompt(story).endsWith(IMAGE_SAFETY_RULES)).toBe(true);
  });

  it('says fiction and leaves out the mood when there is no genre or tone', () => {
    const prompt = storyCoverPrompt({
      premise: 'A long enough premise for the test.',
      genre: null,
      tone: null,
    });

    expect(prompt).toContain('A cover for a fiction story.');
    expect(prompt).not.toContain('Mood:');
  });

  it('shortens a very long premise and collapses its whitespace', () => {
    const prompt = storyCoverPrompt({ ...story, premise: `word   \n ${'x'.repeat(2000)}` });

    expect(prompt).not.toContain('x'.repeat(501));
    expect(prompt).toContain('word xxx');
  });
});
