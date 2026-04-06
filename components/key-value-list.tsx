export function KeyValueList({
  items,
}: {
  items: Array<{ label: string; value: string }>;
}) {
  return (
    <dl className="grid gap-3">
      {items.map((item) => (
        <div key={item.label} className="grid gap-1 rounded-2xl bg-black/20 p-3">
          <dt className="text-xs font-medium uppercase tracking-wide text-zinc-400">{item.label}</dt>
          <dd className="text-sm text-zinc-100">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
