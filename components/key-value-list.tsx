export function KeyValueList({
  items,
}: {
  items: Array<{ label: string; value: string }>;
}) {
  const visibleItems = items.filter((item) => item.label && item.value);

  return (
    <dl className="space-y-3 text-sm">
      {visibleItems.map((item) => (
        <div key={`${item.label}-${item.value}`} className="flex items-start justify-between gap-4 border-b border-white/5 pb-3 last:border-b-0 last:pb-0">
          <dt className="text-zinc-400">{item.label}</dt>
          <dd className="text-right text-zinc-100">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
