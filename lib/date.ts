const STORAGE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function parseStoredDate(date: string | null | undefined) {
  if (!date || !STORAGE_DATE_PATTERN.test(date)) return null;

  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;

  const [year, month, day] = date.split('-').map(Number);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() + 1 !== month ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  return parsed;
}

export function isValidStoredDate(date: string | null | undefined) {
  return parseStoredDate(date) !== null;
}

export function formatShowDate(date: string) {
  const parsed = parseStoredDate(date);
  if (!parsed) return 'Date TBD';

  return new Intl.DateTimeFormat('en-CA', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed);
}

export function formatMonthDay(date: string) {
  const parsed = parseStoredDate(date);
  if (!parsed) return 'TBD';

  return new Intl.DateTimeFormat('en-CA', {
    month: 'short',
    day: 'numeric',
  }).format(parsed);
}

export function formatDateBlock(date: string) {
  const parsed = parseStoredDate(date);
  if (!parsed) {
    return { month: 'TBD', day: '—', weekday: 'Date TBD' };
  }

  return {
    month: new Intl.DateTimeFormat('en-CA', { month: 'short' }).format(parsed).toUpperCase(),
    day: new Intl.DateTimeFormat('en-CA', { day: 'numeric' }).format(parsed),
    weekday: new Intl.DateTimeFormat('en-CA', { weekday: 'short' }).format(parsed),
  };
}

export function isToday(date: string) {
  if (!isValidStoredDate(date)) return false;

  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = `${today.getMonth() + 1}`.padStart(2, '0');
  const dd = `${today.getDate()}`.padStart(2, '0');

  return `${yyyy}-${mm}-${dd}` === date;
}

export function isPastShow(date: string) {
  const showDate = parseStoredDate(date);
  if (!showDate) return false;

  const today = new Date();
  const localToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return showDate < localToday;
}

export function yearFromDate(date: string) {
  const parsed = parseStoredDate(date);
  return parsed ? parsed.getFullYear() : null;
}
