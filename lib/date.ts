export function formatShowDate(date: string) {
  return new Intl.DateTimeFormat('en-CA', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(`${date}T00:00:00`));
}

export function isToday(date: string) {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = `${today.getMonth() + 1}`.padStart(2, '0');
  const dd = `${today.getDate()}`.padStart(2, '0');

  return `${yyyy}-${mm}-${dd}` === date;
}

export function isPastShow(date: string) {
  const today = new Date();
  const localToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const showDate = new Date(`${date}T00:00:00`);
  return showDate < localToday;
}
