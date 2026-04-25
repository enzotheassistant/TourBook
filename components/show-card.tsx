import Link from 'next/link';
import { formatDateBlock, formatShowDate, isToday } from '@/lib/date';
import { Show } from '@/lib/types';

function getDayTypeLabel(dayType: Show['day_type']) {
  if (dayType === 'travel') return 'Travel day';
  if (dayType === 'off') return 'Off day';
  return 'Show day';
}

function getPrimaryTitle(show: Show) {
  if (show.day_type === 'travel') {
    return show.label || show.venue_name || show.city || 'Travel day';
  }

  if (show.day_type === 'off') {
    return show.label || show.city || 'Off day';
  }

  return show.city ? `${show.city}${show.region ? `, ${show.region}` : ''}` : (show.label || 'Show day');
}

function getSecondaryLine(show: Show) {
  if (show.day_type === 'travel') {
    return show.venue_name || show.notes || show.hotel_name || 'Travel / routing details';
  }

  if (show.day_type === 'off') {
    return show.venue_name || show.hotel_name || show.notes || 'Day off';
  }

  return show.venue_name || 'Venue TBA';
}

function getMetaLine(show: Show) {
  const bits = [getDayTypeLabel(show.day_type)];
  if (show.tour_name) bits.push(show.tour_name);
  if (show.day_type !== 'show' && show.city && !getPrimaryTitle(show).includes(show.city)) {
    bits.push(show.region ? `${show.city}, ${show.region}` : show.city);
  }
  return bits.join(' · ');
}

export function ShowCard({ show, tab = 'upcoming' }: { show: Show; tab?: 'upcoming' | 'past' }) {
  const today = isToday(show.date);
  const dateBlock = formatDateBlock(show.date);

  return (
    <Link
      href={`/shows/${show.id}?tab=${tab}`}
      className={`block rounded-[28px] border px-4 py-4 shadow-sm transition active:scale-[0.99] sm:px-5 ${
        today
          ? 'border-emerald-400/30 bg-emerald-500/[0.08]'
          : 'border-white/10 bg-white/[0.045] hover:border-white/20 hover:bg-white/[0.06]'
      }`}
    >
      <div className="flex items-start gap-4 sm:gap-5">
        <div className={`flex w-[74px] shrink-0 flex-col items-center rounded-[22px] border px-3 py-3 text-center ${today ? 'border-emerald-300/35 bg-emerald-400/[0.08]' : 'border-white/10 bg-black/20'}`}>
          <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-400">{dateBlock.month}</span>
          <span className="mt-1 text-[2rem] font-semibold leading-none tracking-tight text-zinc-50">{dateBlock.day}</span>
          <span className="mt-1 text-xs text-zinc-400">{dateBlock.weekday}</span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">{getMetaLine(show)}</p>
              <h2 className="mt-2 truncate text-2xl font-semibold leading-tight tracking-tight text-zinc-50 sm:text-[2rem]">{getPrimaryTitle(show)}</h2>
              <p className="mt-2 truncate text-base text-zinc-200">{getSecondaryLine(show)}</p>
              <p className="mt-2 text-sm text-zinc-500">{formatShowDate(show.date)}</p>
            </div>

            {today ? (
              <span className="inline-flex items-center rounded-full border border-emerald-300/30 bg-emerald-400/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-200">
                Today
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </Link>
  );
}
