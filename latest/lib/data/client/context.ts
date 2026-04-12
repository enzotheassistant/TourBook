'use client';

import type { BootstrapContext, ProjectSummary, TourSummary, WorkspaceSummary } from '@/lib/types/tenant';

async function request<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
    credentials: 'same-origin',
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(payload.error ?? 'Request failed');
  }

  return response.json() as Promise<T>;
}

export function getBootstrapContext() {
  return request<BootstrapContext>('/api/me/context');
}

export function listWorkspaces() {
  return request<WorkspaceSummary[]>('/api/workspaces');
}

export function listProjects(workspaceId: string) {
  const search = new URLSearchParams({ workspaceId });
  return request<ProjectSummary[]>(`/api/projects?${search.toString()}`);
}

export function listTours(workspaceId: string, projectId: string) {
  const search = new URLSearchParams({ workspaceId, projectId });
  return request<TourSummary[]>(`/api/tours?${search.toString()}`);
}
