export function KeyValueList({
  items,
  allowPartial = false,
}: {
  items: Array<{ label: string; value: string }>;
  allowPartial?: boolean;
}) {
  const visibleItems = items
    .map((item) => ({
      label: item.label.trim(),
      value: item.value.trim(),
    }))
    .filter((item) => (allowPartial ? item.label || item.value : item.label && item.value));

  return (
    <dl className="space-y-3 text-sm">
      {visibleItems.map((item, index) => (
        <div key={`${item.label}-${item.value}-${index}`} className="flex items-start justify-between gap-4 border-b border-white/5 pb-3 last:border-b-0 last:pb-0">
          <dt className="text-zinc-400">{item.label || '—'}</dt>
          <dd className="text-right text-zinc-100">{item.value || '—'}</dd>
        </div>
      ))}
    </dl>
  );
}
