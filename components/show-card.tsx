import Link from 'next/link';
import { formatDateBlock, isToday } from '@/lib/date';
import { Show } from '@/lib/types';

function getDayTypeAccentClassName(dayType: Show['day_type']) {
  if (dayType === 'travel') return 'bg-sky-300/80';
  if (dayType === 'off') return 'bg-violet-300/80';
  return 'bg-amber-300/80';
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

function getSupportingMeta(show: Show) {
  const meta: string[] = [];
  const locationLine = getLocationLine(show);
  if (locationLine) meta.push(locationLine);
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
      <div className="relative flex items-start gap-3 p-3 sm:grid sm:grid-cols-[108px,minmax(0,1fr)] sm:items-stretch sm:gap-5 sm:p-5">
        <div
          className={`relative flex w-[92px] shrink-0 items-center gap-4 overflow-hidden rounded-[22px] border px-3 py-3 sm:min-h-0 sm:w-auto sm:flex-col sm:items-center sm:justify-center sm:gap-0 sm:px-4 sm:py-4 ${
            today ? 'border-emerald-300/25 bg-emerald-400/[0.075]' : 'border-white/10 bg-black/20'
          }`}
        >
          <div className={`absolute inset-y-3 left-0 w-[3px] rounded-r-full sm:inset-x-4 sm:top-0 sm:h-[3px] sm:w-auto sm:rounded-b-full sm:rounded-tr-none ${today ? 'bg-emerald-300/80' : getDayTypeAccentClassName(show.day_type)}`} />

          <div className="min-w-0 flex-1 sm:flex-none sm:text-center">
            <div className="flex items-center gap-2 sm:justify-center">
              <span className="text-[11px] font-semibold uppercase tracking-[0.26em] text-zinc-400">{dateBlock.month}</span>
              {today ? (
                <span className="inline-flex items-center rounded-full border border-emerald-300/20 bg-emerald-400/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-emerald-200 sm:hidden">
                  Today
                </span>
              ) : null}
            </div>
            <div className="mt-1 flex items-end gap-2 sm:mt-2 sm:flex-col sm:items-center sm:gap-0">
              <span className="text-[2rem] font-semibold leading-none tracking-[-0.05em] text-zinc-50 sm:text-[2.5rem]">{dateBlock.day}</span>
              <span className="pb-1 text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-400 sm:pb-0 sm:pt-1">{dateBlock.weekday}</span>
            </div>
          </div>

        </div>

        <div className="min-w-0">
          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:gap-4">
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <h2 className="break-words text-[1.05rem] font-semibold leading-[1.05] tracking-[-0.03em] text-zinc-50 sm:mt-3 sm:text-[1.6rem]">
                  {getPrimaryTitle(show)}
                </h2>

                <p className={`break-words text-[13px] leading-5 text-zinc-200/92 sm:mt-2 sm:max-w-[58ch] sm:text-[15px] sm:leading-6 ${clampTextClassName(show.day_type)}`}>
                  {getSecondaryLine(show)}
                </p>
              </div>

              <div className="hidden shrink-0 self-start text-right sm:block">
                <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-500">
                  {tab === 'past' ? 'Completed' : 'Itinerary'}
                </span>
              </div>
            </div>

            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end sm:justify-between sm:border-t sm:border-white/6 sm:pt-4">
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-zinc-500 sm:text-[13px]">
                  {supportingMeta.map((item, index) => (
                    <span key={`${item}-${index}`} className="inline-flex min-w-0 max-w-full items-center gap-2">
                      {index > 0 ? <span className="text-zinc-700" aria-hidden="true">•</span> : null}
                      <span className="max-w-full truncate">{item}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
