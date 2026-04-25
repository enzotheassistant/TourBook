import Link from 'next/link';
import { formatDateBlock, formatShowDate, isToday } from '@/lib/date';
import { Show } from '@/lib/types';

function getDayTypeLabel(dayType: Show['day_type']) {
  if (dayType === 'travel') return 'Travel day';
  if (dayType === 'off') return 'Off day';
  return 'Show day';
}

function getDayTypeBadgeClassName(dayType: Show['day_type']) {
  if (dayType === 'travel') return 'border-sky-400/20 bg-sky-400/10 text-sky-200';
  if (dayType === 'off') return 'border-violet-400/20 bg-violet-400/10 text-violet-200';
  return 'border-amber-400/20 bg-amber-400/10 text-amber-200';
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

function getLocationLine(show: Show) {
  if (show.day_type === 'show') {
    if (show.country && show.region) return `${show.region}, ${show.country}`;
    if (show.country) return show.country;
    if (show.region) return show.region;
    return null;
  }

  if (show.city) {
    if (show.region && show.country) return `${show.city}, ${show.region}, ${show.country}`;
    if (show.region) return `${show.city}, ${show.region}`;
    if (show.country) return `${show.city}, ${show.country}`;
    return show.city;
  }

  if (show.region && show.country) return `${show.region}, ${show.country}`;
  if (show.region) return show.region;
  if (show.country) return show.country;
  return null;
}

function getMetaBits(show: Show) {
  const bits = [getDayTypeLabel(show.day_type)];
  if (show.tour_name) bits.push(show.tour_name);
  return bits;
}

export function ShowCard({ show, tab = 'upcoming' }: { show: Show; tab?: 'upcoming' | 'past' }) {
  const today = isToday(show.date);
  const dateBlock = formatDateBlock(show.date);
  const metaBits = getMetaBits(show);
  const locationLine = getLocationLine(show);

  return (
    <Link
      href={`/shows/${show.id}?tab=${tab}`}
      className={`group block rounded-[30px] border px-4 py-4 shadow-sm transition active:scale-[0.99] sm:px-5 ${
        today
          ? 'border-emerald-400/30 bg-emerald-500/[0.08]'
          : 'border-white/10 bg-white/[0.045] hover:border-white/20 hover:bg-white/[0.06]'
      }`}
    >
      <div className="flex items-start gap-3 sm:gap-5">
        <div
          className={`relative flex w-[82px] shrink-0 flex-col items-center rounded-[24px] border px-3 py-3 text-center sm:w-[92px] sm:px-4 ${today ? 'border-emerald-300/35 bg-emerald-400/[0.08]' : 'border-white/10 bg-black/20'}`}
        >
          {today ? (
            <span className="mb-2 inline-flex items-center rounded-full border border-emerald-300/30 bg-emerald-400/12 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-emerald-200 sm:hidden">
              Today
            </span>
          ) : null}
          <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-400">{dateBlock.month}</span>
          <span className="mt-1 text-[2.15rem] font-semibold leading-none tracking-[-0.04em] text-zinc-50 sm:text-[2.35rem]">{dateBlock.day}</span>
          <span className="mt-1 text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-400">{dateBlock.weekday}</span>
          <span className="mt-3 h-px w-8 bg-white/10" aria-hidden="true" />
          <span className="mt-3 text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-500">
            {show.day_type === 'show' ? 'Live' : show.day_type === 'travel' ? 'Route' : 'Reset'}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${getDayTypeBadgeClassName(show.day_type)}`}>
                  {getDayTypeLabel(show.day_type)}
                </span>
                {show.tour_name ? (
                  <span className="truncate text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                    {show.tour_name}
                  </span>
                ) : null}
              </div>

              <h2 className="mt-3 text-[1.35rem] font-semibold leading-[1.05] tracking-[-0.03em] text-zinc-50 sm:text-[1.65rem]">
                {getPrimaryTitle(show)}
              </h2>

              <p className="mt-2 text-sm leading-6 text-zinc-200 sm:text-[15px]">
                {getSecondaryLine(show)}
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-500">
                <span>{formatShowDate(show.date)}</span>
                {locationLine ? (
                  <>
                    <span className="hidden text-zinc-700 sm:inline" aria-hidden="true">•</span>
                    <span>{locationLine}</span>
                  </>
                ) : null}
                {!show.tour_name ? (
                  <>
                    <span className="hidden text-zinc-700 sm:inline" aria-hidden="true">•</span>
                    <span>{metaBits[0]}</span>
                  </>
                ) : null}
              </div>
            </div>

            {today ? (
              <span className="hidden shrink-0 items-center rounded-full border border-emerald-300/30 bg-emerald-400/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-200 sm:inline-flex">
                Today
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </Link>
  );
}
