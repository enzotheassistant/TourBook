'use client';

import Link from 'next/link';
import { MouseEvent, useEffect, useRef } from 'react';
import { trackActivationEvent } from '@/lib/activation-telemetry';

type EmptyStateTelemetry = {
  stateType: string;
  workspaceId?: string | null;
  projectId?: string | null;
  role?: string | null;
};

function buttonClassName(tone: 'primary' | 'ghost' = 'ghost') {
  if (tone === 'primary') {
    return 'inline-flex h-10 items-center rounded-full border border-indigo-400/45 bg-indigo-500/12 px-4 text-sm font-medium text-indigo-200 transition hover:bg-indigo-500/20';
  }

  return 'inline-flex h-10 items-center rounded-full border border-white/10 bg-transparent px-4 text-sm font-medium text-zinc-100 transition hover:border-white/20 hover:bg-white/[0.05]';
}

export function ActivationEmptyState({
  title,
  body,
  actions,
  telemetry,
}: {
  title: string;
  body: string;
  actions?: Array<{ label: string; href: string; tone?: 'primary' | 'ghost'; ctaId?: string }>;
  telemetry?: EmptyStateTelemetry;
}) {
  const didTrackRef = useRef(false);

  useEffect(() => {
    if (!telemetry || didTrackRef.current) return;
    didTrackRef.current = true;
    void trackActivationEvent({
      event: 'activation.empty_state_rendered',
      stateType: telemetry.stateType,
      workspaceId: telemetry.workspaceId,
      projectId: telemetry.projectId,
      role: telemetry.role,
    });
  }, [telemetry]);

  function handleActionClick(action: { label: string; ctaId?: string }, _event: MouseEvent<HTMLAnchorElement>) {
    if (!telemetry) return;
    void trackActivationEvent({
      event: 'activation.create_cta_clicked',
      stateType: telemetry.stateType,
      cta: action.ctaId ?? action.label,
      workspaceId: telemetry.workspaceId,
      projectId: telemetry.projectId,
      role: telemetry.role,
    });
  }

  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-5 text-zinc-200">
      <h2 className="text-base font-semibold tracking-tight text-zinc-100">{title}</h2>
      <p className="mt-2 text-sm text-zinc-300">{body}</p>
      {actions?.length ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {actions.map((action) => (
            <Link key={`${action.href}:${action.label}`} href={action.href} className={buttonClassName(action.tone)} onClick={(event) => handleActionClick(action, event)}>
              {action.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
