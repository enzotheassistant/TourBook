import Link from 'next/link';

function buttonClassName(tone: 'primary' | 'ghost' = 'ghost') {
  if (tone === 'primary') {
    return 'inline-flex h-10 items-center rounded-full border border-emerald-400/45 bg-emerald-500/12 px-4 text-sm font-medium text-emerald-200 transition hover:bg-emerald-500/20';
  }

  return 'inline-flex h-10 items-center rounded-full border border-white/10 bg-transparent px-4 text-sm font-medium text-zinc-100 transition hover:border-white/20 hover:bg-white/[0.05]';
}

export function ActivationEmptyState({
  title,
  body,
  actions,
}: {
  title: string;
  body: string;
  actions?: Array<{ label: string; href: string; tone?: 'primary' | 'ghost' }>;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-5 text-zinc-200">
      <h2 className="text-base font-semibold tracking-tight text-zinc-100">{title}</h2>
      <p className="mt-2 text-sm text-zinc-300">{body}</p>
      {actions?.length ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {actions.map((action) => (
            <Link key={`${action.href}:${action.label}`} href={action.href} className={buttonClassName(action.tone)}>
              {action.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
