export const REVIEW_POST_STATUS = 'in_review';
export const PENDING_POST_STATUS = 'pending';
export const CANCELLED_POST_STATUS = 'deleted';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_LOOKAHEAD_DAYS = 120;

function atHour(day: Date, hour: number): Date {
  const slot = new Date(day);
  slot.setHours(hour, 0, 0, 0);
  return slot;
}

/**
 * The next posting slot that is in the future and not already taken.
 *
 * Slots are fixed weekdays at a fixed hour — generating three drafts in one sitting
 * should spread them across three posting days rather than stacking them on one.
 */
export function nextFreeSlot(
  taken: ReadonlyArray<Date>,
  options: { weekdays: number[]; hour: number; from?: Date }
): Date {
  const weekdays = new Set(options.weekdays);
  if (weekdays.size === 0) {
    throw new Error('nextFreeSlot needs at least one weekday');
  }

  const from = options.from ?? new Date();
  const occupied = new Set(taken.map(slot => slot.getTime()));

  for (let offset = 0; offset <= MAX_LOOKAHEAD_DAYS; offset += 1) {
    const day = new Date(from.getTime() + offset * DAY_MS);
    if (!weekdays.has(day.getDay())) {
      continue;
    }

    const slot = atHour(day, options.hour);
    if (slot.getTime() <= from.getTime()) {
      continue;
    }
    if (occupied.has(slot.getTime())) {
      continue;
    }

    return slot;
  }

  throw new Error(`no free posting slot within ${MAX_LOOKAHEAD_DAYS} days`);
}

export function parseWeekdays(raw: string): number[] {
  return raw
    .split(',')
    .map(value => Number(value.trim()))
    .filter(value => Number.isInteger(value) && value >= 0 && value <= 6);
}
