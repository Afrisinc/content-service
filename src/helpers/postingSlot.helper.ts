export const REVIEW_POST_STATUS = 'in_review';
export const PENDING_POST_STATUS = 'pending';
export const CANCELLED_POST_STATUS = 'deleted';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_LOOKAHEAD_DAYS = 120;

/**
 * The parts of an instant as they read in a given timezone.
 *
 * Read by type rather than by position: locales order the parts differently, so
 * destructuring the array swaps day and month in half the world.
 */
function partsIn(when: Date, timeZone: string): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(when);

  const value = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find(part => part.type === type)?.value ?? 0);

  return { year: value('year'), month: value('month'), day: value('day') };
}

/** How far the zone sits from UTC at that instant, in minutes. */
function offsetMinutes(when: Date, timeZone: string): number {
  // `en-CA` formats as YYYY-MM-DD, which Date.parse reads back unambiguously.
  const local = new Date(
    `${new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
      .format(when)
      .replace(', ', 'T')}Z`
  );

  return (local.getTime() - when.getTime()) / 60000;
}

/**
 * The instant at which the clock reads `hour:00` on the calendar day `day` falls
 * on, in `timeZone`.
 *
 * A brand's posting hour belongs to its audience, not to whichever machine runs
 * the cron, so this cannot use `setHours` — that would resolve in server time.
 * The offset is measured twice because it can change between the guess and the
 * answer, which is exactly what happens across a daylight-saving boundary.
 */
function atHour(day: Date, hour: number, timeZone?: string): Date {
  if (!timeZone) {
    const slot = new Date(day);
    slot.setHours(hour, 0, 0, 0);
    return slot;
  }

  const { year, month, day: date } = partsIn(day, timeZone);
  const asUtc = Date.UTC(year, month - 1, date, hour, 0, 0, 0);

  const guess = new Date(asUtc - offsetMinutes(new Date(asUtc), timeZone) * 60000);
  return new Date(asUtc - offsetMinutes(guess, timeZone) * 60000);
}

/** The weekday `when` falls on, as read in `timeZone`. */
function weekdayIn(when: Date, timeZone?: string): number {
  if (!timeZone) {
    return when.getDay();
  }

  const label = new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'short' }).format(when);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(label);
}

/**
 * The next posting slot that is in the future and not already taken.
 *
 * Slots are fixed weekdays at a fixed hour — generating three drafts in one sitting
 * should spread them across three posting days rather than stacking them on one.
 */
export function nextFreeSlot(
  taken: ReadonlyArray<Date>,
  options: { weekdays: number[]; hour: number; from?: Date; timeZone?: string }
): Date {
  const weekdays = new Set(options.weekdays);
  if (weekdays.size === 0) {
    throw new Error('nextFreeSlot needs at least one weekday');
  }

  const from = options.from ?? new Date();
  const occupied = new Set(taken.map(slot => slot.getTime()));

  for (let offset = 0; offset <= MAX_LOOKAHEAD_DAYS; offset += 1) {
    const day = new Date(from.getTime() + offset * DAY_MS);
    if (!weekdays.has(weekdayIn(day, options.timeZone))) {
      continue;
    }

    const slot = atHour(day, options.hour, options.timeZone);
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
  return (
    raw
      .split(',')
      .map(value => value.trim())
      // An empty segment is not a Sunday: `Number('')` is 0, which would silently
      // turn a blank setting into "post on Sundays".
      .filter(value => value.length > 0)
      .map(Number)
      .filter(value => Number.isInteger(value) && value >= 0 && value <= 6)
  );
}
