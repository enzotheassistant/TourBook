import Link from 'next/link';
import { formatDateBlock, isToday } from '@/lib/date';
import { Show } from '@/lib/types';

function getDayTypeLabel(dayType: Show['day_type']) {
  if (dayType === 'travel') return 'Travel day';
  if (dayType === 'off') return 'Off day';
  return 'Show day';
}

function getCityLine(show: Show) {
  if (show.city) {
    if (show.region && show.country) return `${show.city}, ${show.region}, ${show.country}`;
    if (show.region) return `${show.city}, ${show.region}`;
    if (show.country) return `${show.city}, ${show.country}`;
    return show.city;
  }

  if (show.day_type === 'travel') return 'Travel day';
  if (show.day_type === 'off') return 'Off day';
  return show.label || 'Show day';
}

function getVenueLine(show: Show) {
  if (show.day_type === 'travel') {
    return show.venue_name || show.label || show.notes || show.hotel_name || 'Routing details';
  }

  if (show.day_type === 'off') {
    return show.venue_name || show.hotel_name || show.label || show.notes || 'Day off';
  }

  return show.venue_name || show.label || 'Venue TBA';
}

function getSupportingMeta(show: Show) {
  const meta: string[] = [];
  if (show.tour_name) meta.push(show.tour_name);
  return meta;
}

function clampTextClassName(dayType: Show['day_type']) {
  return dayType === 'show' ? 'line-clamp-1 sm:line-clamp-2' : 'line-clamp-2';
}

export function ShowCard({ show, tab = 'upcoming' }: { show: Show; tab?: 'upcoming' | 'past' }) {
  const today = isToday(show.date);
  const dateBlock = formatDateBlock(show.date);
  const supportingMeta = getSupportingMeta(show);

  return (
    <Link
      href={`/shows/${show.id}?tab=${tab}`}
      className={`group relative block overflow-hidden rounded-[30px] border transition duration-200 active:scale-[0.99] ${
        today
          ? 'border-emerald-400/25 bg-emerald-500/[0.065] shadow-[0_10px_36px_rgba(16,185,129,0.08)]'
          : 'border-white/10 bg-white/[0.04] hover:border-white/20 hover:bg-white/[0.055]'
      }`}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/14 to-transparent opacity-60" />

      {/* Always a left/right row layout — compact date rail on left, content on right */}
      <div className="relative flex items-center gap-3 p-3 sm:gap-4 sm:p-4">

        {/* Date Rail — compact vertical pill, same on all screen sizes */}
        <div
          className={`relative flex w-[68px] shrink-0 flex-col items-center justify-center overflow-hidden rounded-[18px] border px-2 py-3 sm:w-[72px] sm:py-3.5 ${
            today ? 'border-emerald-300/25 bg-emerald-400/[0.075]' : 'border-white/10 bg-black/20'
          }`}
        >
          {/* Left accent bar — always vertical */}
          <div
            className={`absolute inset-y-3 left-0 w-[3px] rounded-r-full ${
              today ? 'bg-emerald-300/80' : 'bg-white/12'
            }`}
          />

          <span
            className={`text-[9px] font-semibold uppercase tracking-[0.22em] ${
              today ? 'text-emerald-200' : 'text-zinc-400'
            }`}
          >
            {dateBlock.month}
          </span>

          <span className="mt-0.5 text-[1.9rem] font-semibold leading-none tracking-[-0.05em] text-zinc-50">
            {dateBlock.day}
          </span>

          <span
            className={`mt-1 text-[9px] font-medium uppercase tracking-[0.16em] ${
              today ? 'text-emerald-200/90' : 'text-zinc-400'
            }`}
          >
            {dateBlock.weekday}
          </span>
        </div>

        {/* Show Info — right side */}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-col gap-1.5 sm:gap-2">

            <div className="flex flex-wrap items-center gap-2">
              {today ? (
                <span className="inline-flex items-center rounded-full border border-emerald-300/20 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-200">
                  Today
                </span>
              ) : null}
              <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-500">
                {getDayTypeLabel(show.day_type)}
              </span>
            </div>

            <h2 className="break-words text-[1.05rem] font-semibold leading-[1.05] tracking-[-0.03em] text-zinc-50 sm:text-[1.25rem]">
              {getCityLine(show)}
            </h2>

            <p
              className={`break-words text-[13px] leading-5 text-zinc-200/92 sm:max-w-[58ch] ${clampTextClassName(show.day_type)}`}
            >
              {getVenueLine(show)}
            </p>

            {supportingMeta.length > 0 ? (
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 pt-0.5 text-[11px] text-zinc-500 sm:text-[12px]">
                {supportingMeta.map((item, index) => (
                  <span key={`${item}-${index}`} className="inline-flex min-w-0 max-w-full items-center gap-2">
                    {index > 0 ? <span className="text-zinc-700" aria-hidden="true">•</span> : null}
                    <span className="max-w-full truncate">{item}</span>
                  </span>
                ))}
              </div>
            ) : null}

          </div>
        </div>
      </div>
    </Link>
  );
}
