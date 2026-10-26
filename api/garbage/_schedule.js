// Pickup rules. The provider export has no dates, so these are defined here.
// Update `exceptions` by hand when the provider's site shows a holiday shift.
export const BINS = [
  { name: 'rest and food', every: 14, first: '2026-10-30' },
  { name: 'paper and plastic', every: 14, first: '2026-10-30' },
  { name: 'glass and metal', every: 28, first: '2026-11-03' },
];

// { bin: 'glass and metal', from: '2026-12-29', to: '2026-12-30' }
export const exceptions = [];

const DAY_MS = 86400000;

// Calendar days only: dates are 'YYYY-MM-DD' strings, maths runs on UTC midnights,
// so DST changes can't shift anything.
const toDay = ymd => Date.parse(ymd + 'T00:00:00Z') / DAY_MS;
const fromDay = day => new Date(day * DAY_MS).toISOString().slice(0, 10);

export function todayInStockholm(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Stockholm' }).format(now);
}

export function stockholmHour(now = new Date()) {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Stockholm', hour: 'numeric', hourCycle: 'h23' }).format(now));
}

function nextForBin(bin, today) {
  const todayDay = toDay(today);
  const firstDay = toDay(bin.first);
  // Start one interval early: an exception can move an earlier date to today or later.
  const start = Math.max(0, Math.floor((todayDay - firstDay) / bin.every) - 1);
  for (let k = start; k < start + 4; k++) {
    let date = fromDay(firstDay + k * bin.every);
    const exception = exceptions.find(e => e.bin === bin.name && e.from === date);
    if (exception) date = exception.to;
    if (date >= today) return date;
  }
}

// Earliest pickup on or after `today`, with every bin that shares that date.
export function nextPickup(today) {
  const dates = BINS.map(bin => ({ bin, date: nextForBin(bin, today) }));
  const date = dates.map(d => d.date).sort()[0];
  return {
    date,
    bins: dates.filter(d => d.date === date).map(d => d.bin.name),
    daysAway: toDay(date) - toDay(today),
  };
}

export function formatDate(ymd) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' })
      .formatToParts(new Date(ymd + 'T00:00:00Z')).map(p => [p.type, p.value])
  );
  return `${parts.weekday} ${parts.day} ${parts.month}`;
}

// The page sentence as parts, so the page can set strong words and soft words differently.
export function view(today) {
  const { date, bins, daysAway } = nextPickup(today);
  const names = bins.flatMap((name, i) => i ? [{ t: ', ' }, { t: name, strong: true }] : [{ t: name, strong: true }]);
  const when = daysAway <= 1
    ? [{ t: daysAway ? 'tomorrow' : 'today', strong: true }, { t: ', ' + formatDate(date) }]
    : [{ t: formatDate(date), strong: true }];
  return {
    parts: [{ t: 'Next pickup is ' }, ...when, { t: ': ' }, ...names, { t: '.' }],
    note: daysAway === 0 ? 'Today' : daysAway === 1 ? 'Put it out tonight' : `In ${daysAway} days`,
  };
}

// Push text for the 21:00 reminder, or null if tomorrow isn't a pickup day.
export function reminder(today) {
  const { daysAway, bins } = nextPickup(today);
  return daysAway === 1 ? { title: 'Put out the garbage', body: `Pickup tomorrow: ${bins.join(', ')}.` } : null;
}
