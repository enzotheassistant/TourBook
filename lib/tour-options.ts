// Builds the Tour dropdown for the date form.
//   - Current: tours with an upcoming date, or no dates yet.
//   - Past tours: every date is in the past (shown in a group at the bottom).
//   - Archived tours are hidden — except the one this date already uses, so
//     its label still shows.

export type TourOptionGroups = { current: string[]; past: string[] };

function key(name: string) {
  return name.trim().toLowerCase();
}

export function buildTourOptions(input: {
  /** Every date in the project: its day (YYYY-MM-DD) and tour name. */
  dates: Array<{ date: string; tourName: string }>;
  /** Tour records for the project (names and whether they're archived). */
  tours: Array<{ name: string; archivedAt?: string | null }>;
  /** Today's date, YYYY-MM-DD. */
  today: string;
  /** The tour this date already has, if any. */
  currentValue?: string;
}): TourOptionGroups {
  const archived = new Set(input.tours.filter((tour) => tour.archivedAt).map((tour) => key(tour.name)));
  const currentKey = input.currentValue ? key(input.currentValue) : '';

  // One display name per tour (first spelling seen) and its latest date.
  const names = new Map<string, string>();
  const latest = new Map<string, string>();
  for (const { date, tourName } of input.dates) {
    const name = tourName.trim();
    if (!name) continue;
    const k = key(name);
    if (!names.has(k)) names.set(k, name);
    if (date && (!latest.has(k) || date > (latest.get(k) as string))) latest.set(k, date);
  }
  for (const tour of input.tours) {
    const name = tour.name.trim();
    if (name && !names.has(key(name))) names.set(key(name), name);
  }

  const current: string[] = [];
  const past: string[] = [];
  for (const [k, name] of names) {
    if (archived.has(k) && k !== currentKey) continue;
    const last = latest.get(k);
    if (!last || last >= input.today) current.push(name);
    else past.push(name);
  }
  const byName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' });
  return { current: current.sort(byName), past: past.sort(byName) };
}
