/**
 * Turns a phone number as typed ("(519) 555-0123 ext 4") into a tel: link
 * target. Returns null when there aren't enough digits to be a real number,
 * so odd values like "TBA" stay plain text.
 */
export function telHref(phone: string | null | undefined) {
  const trimmed = (phone ?? '').trim();
  if (!trimmed) return null;
  // Drop any extension so the dialer gets just the number.
  const main = trimmed.split(/\s*(?:ext\.?|x|#)\s*\d+\s*$/i)[0];
  const digits = main.replace(/\D/g, '');
  if (digits.length < 7) return null;
  return `tel:${main.trim().startsWith('+') ? '+' : ''}${digits}`;
}

export function KeyValueList({
  items,
  allowPartial = false,
}: {
  items: Array<{ label: string; value: string; href?: string | null }>;
  allowPartial?: boolean;
}) {
  const visibleItems = items
    .map((item) => ({
      label: item.label.trim(),
      value: item.value.trim(),
      href: item.href ?? null,
    }))
    .filter((item) => (allowPartial ? item.label || item.value : item.label && item.value));

  return (
    <dl className="space-y-3 text-sm">
      {visibleItems.map((item, index) => (
        <div key={`${item.label}-${item.value}-${index}`} className="flex items-start justify-between gap-4 border-b border-white/5 pb-3 last:border-b-0 last:pb-0">
          <dt className="text-zinc-400">{item.label || '—'}</dt>
          <dd className="text-right text-zinc-100">
            {item.value && item.href ? (
              <a href={item.href} className="-my-2 inline-block break-words py-2 text-accent-light underline underline-offset-4">{item.value}</a>
            ) : (
              item.value || '—'
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
