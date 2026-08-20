import { nextFreeSlot, parseWeekdays } from '@/helpers/postingSlot.helper';
import { describe, expect, it } from 'vitest';

const TUESDAY_AND_FRIDAY = [2, 5];

// A Monday, so the next Tuesday slot is unambiguous.
const MONDAY = new Date(2026, 7, 17, 14, 0, 0, 0);

describe('nextFreeSlot', () => {
  it('lands on the next configured weekday at the configured hour', () => {
    const slot = nextFreeSlot([], { weekdays: TUESDAY_AND_FRIDAY, hour: 9, from: MONDAY });

    expect(slot.getDay()).toBe(2);
    expect(slot.getHours()).toBe(9);
    expect(slot.getDate()).toBe(18);
  });

  it('skips a slot that is already taken', () => {
    const tuesday = nextFreeSlot([], { weekdays: TUESDAY_AND_FRIDAY, hour: 9, from: MONDAY });
    const next = nextFreeSlot([tuesday], { weekdays: TUESDAY_AND_FRIDAY, hour: 9, from: MONDAY });

    expect(next.getDay()).toBe(5);
    expect(next.getTime()).toBeGreaterThan(tuesday.getTime());
  });

  it('spreads three drafts generated in one sitting across three posting days', () => {
    const taken: Date[] = [];
    for (let i = 0; i < 3; i += 1) {
      taken.push(nextFreeSlot(taken, { weekdays: TUESDAY_AND_FRIDAY, hour: 9, from: MONDAY }));
    }

    const unique = new Set(taken.map(slot => slot.getTime()));
    expect(unique.size).toBe(3);
    expect(taken.map(slot => slot.getDay())).toEqual([2, 5, 2]);
  });

  it('never returns a slot in the past', () => {
    const lateTuesday = new Date(2026, 7, 18, 18, 0, 0, 0);
    const slot = nextFreeSlot([], {
      weekdays: TUESDAY_AND_FRIDAY,
      hour: 9,
      from: lateTuesday,
    });

    expect(slot.getTime()).toBeGreaterThan(lateTuesday.getTime());
    expect(slot.getDay()).toBe(5);
  });

  it('honours a single-weekday schedule', () => {
    const slot = nextFreeSlot([], { weekdays: [3], hour: 7, from: MONDAY });

    expect(slot.getDay()).toBe(3);
    expect(slot.getHours()).toBe(7);
  });

  it('refuses to run without a weekday', () => {
    expect(() => nextFreeSlot([], { weekdays: [], hour: 9, from: MONDAY })).toThrow(
      'at least one weekday'
    );
  });

  it('gives up rather than looping forever when every slot is taken', () => {
    const taken: Date[] = [];
    for (let i = 0; i < 60; i += 1) {
      taken.push(nextFreeSlot(taken, { weekdays: TUESDAY_AND_FRIDAY, hour: 9, from: MONDAY }));
    }

    expect(() =>
      nextFreeSlot(taken, { weekdays: TUESDAY_AND_FRIDAY, hour: 9, from: MONDAY })
    ).toThrow('no free posting slot');
  });
});

describe('parseWeekdays', () => {
  it('reads a comma separated list', () => {
    expect(parseWeekdays('2,5')).toEqual([2, 5]);
    expect(parseWeekdays(' 1 , 3 , 6 ')).toEqual([1, 3, 6]);
  });

  it('drops anything that is not a weekday index', () => {
    expect(parseWeekdays('2,9,-1,x,5')).toEqual([2, 5]);
  });

  it('returns nothing for an empty setting', () => {
    expect(parseWeekdays('')).toEqual([]);
  });
});
