'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  getBrowserSupabaseClient,
  syncSessionToServer,
  clearServerSession,
  backupRefreshToken,
  getBackupRefreshTokenWithDiagnostics,
  clearBackupRefreshToken,
  authLog,
} from '@/lib/supabase/client';
import type { BootstrapContext } from '@/lib/types/tenant';

type AppContextValue = BootstrapContext & {
  isLoading: boolean;
  refreshContext: () => Promise<void>;
  setActiveWorkspaceId: (workspaceId: string | null) => void;
  setActiveProjectId: (projectId: string | null) => void;
  setActiveTourId: (tourId: string | null) => void;
};

const WORKSPACE_STORAGE_KEY = 'tourbook.activeWorkspaceId';
const PROJECT_STORAGE_KEY = 'tourbook.activeProjectId';
const TOUR_STORAGE_KEY = 'tourbook.activeTourId';

const AppContext = createContext<AppContextValue | null>(null);

const EMPTY_CONTEXT: BootstrapContext = {
  user: null,
  memberships: [],
  workspaces: [],
  projects: [],
  tours: [],
  activeWorkspaceId: null,
  activeProjectId: null,
  activeTourId: null,
};

function readStoredValue(key: string) {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(key);
}

function writeStoredValue(key: string, value: string | null) {
  if (typeof window === 'undefined') return;

  if (value) {
    window.localStorage.setItem(key, value);
  } else {
    window.localStorage.removeItem(key);
  }
}

export function AppContextProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [bootstrap, setBootstrap] = useState<BootstrapContext>(EMPTY_CONTEXT);
  const [isLoading, setIsLoading] = useState(true);

  const refreshContext = useCallback(async () => {
    setIsLoading(true);

    try {
      const supabase = getBrowserSupabaseClient();

      // Restore session from localStorage (PWA persistence).
      // getSession() reads from localStorage and will auto-refresh the access
      // token if it is expired but a valid refresh token exists.
      authLog("refreshContext: calling supabase.auth.getSession()…");
      let {
        data: { session },
      } = await supabase.auth.getSession();

      authLog(
        session
          ? `refreshContext: getSession() → session found ✓ (user: ${session.user?.email ?? session.user?.id}, expires: ${new Date((session.expires_at ?? 0) * 1000).toISOString()})`
          : "refreshContext: getSession() → null — localStorage is empty or session expired",
      );

      // iOS Safari PWA recovery: if localStorage was cleared by the OS
      // (ITP eviction, low storage, system update), getSession() returns null.
      // Attempt a silent recovery using the refresh token backed up in a
      // persistent cookie before giving up and redirecting to /login.
      if (!session) {
        authLog("refreshContext: no session — checking for backup refresh token cookie…");
        const backupToken = getBackupRefreshTokenWithDiagnostics();
        if (backupToken) {
          authLog("refreshContext: attempting silent recovery via refreshSession()…");
          const { data: recovered, error: refreshError } = await supabase.auth.refreshSession({
            refresh_token: backupToken,
          });
          if (!refreshError && recovered.session) {
            session = recovered.session;
            authLog(`refreshContext: silent recovery SUCCEEDED ✓ (user: ${session.user?.email ?? session.user?.id})`);
          } else {
            authLog("refreshContext: silent recovery FAILED ✗", {
              error: refreshError?.message ?? refreshError,
              hasRecoveredSession: !!recovered.session,
            });
            // Backup token is stale — remove it so we don't retry indefinitely.
            clearBackupRefreshToken();
          }
        } else {
          authLog("refreshContext: no backup token — will redirect to /login");
        }
      }

      if (session?.access_token && session?.refresh_token) {
        // Keep the cookie backup current with the latest refresh token so
        // the next recovery attempt (if localStorage is cleared again) works.
        backupRefreshToken(session.refresh_token);
        // Re-sync server-side cookies on every boot so Next.js API routes
        // can authenticate the user even after a PWA close/reopen.
        authLog("refreshContext: syncing session to server cookies…");
        await syncSessionToServer(session.access_token, session.refresh_token);
        authLog("refreshContext: server sync complete ✓");
      }

      const response = await fetch('/api/me/context', {
        method: 'GET',
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
        credentials: 'same-origin',
        cache: 'no-store',
      });

      if (response.status === 401) {
        setBootstrap(EMPTY_CONTEXT);
        router.replace('/login');
        router.refresh();
        return;
      }

      if (!response.ok) {
        setBootstrap(EMPTY_CONTEXT);
        return;
      }

      const data = (await response.json()) as BootstrapContext;

      const storedWorkspaceId = readStoredValue(WORKSPACE_STORAGE_KEY);
      const storedProjectId = readStoredValue(PROJECT_STORAGE_KEY);
      const storedTourId = readStoredValue(TOUR_STORAGE_KEY);

      const fallbackWorkspaceId =
        data.workspaces.find((workspace) => data.projects.some((project) => project.workspaceId === workspace.id))?.id
        ?? data.workspaces[0]?.id
        ?? null;

      const activeWorkspaceId = data.workspaces.some((workspace) => workspace.id === storedWorkspaceId)
        ? storedWorkspaceId
        : data.activeWorkspaceId ?? fallbackWorkspaceId;

      const activeProjects = activeWorkspaceId
        ? data.projects.filter((project) => project.workspaceId === activeWorkspaceId)
        : [];

      const activeProjectId = activeProjects.some((project) => project.id === storedProjectId)
        ? storedProjectId
        : activeProjects.some((project) => project.id === data.activeProjectId)
          ? data.activeProjectId
          : activeProjects[0]?.id ?? null;

      const activeTours = activeProjectId
        ? data.tours.filter((tour) => tour.projectId === activeProjectId)
        : [];

      const activeTourId = activeTours.some((tour) => tour.id === storedTourId)
        ? storedTourId
        : activeTours.some((tour) => tour.id === data.activeTourId)
          ? data.activeTourId
          : activeTours[0]?.id ?? null;

      setBootstrap({
        ...data,
        activeWorkspaceId,
        activeProjectId,
        activeTourId,
      });
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void refreshContext();
  }, [refreshContext]);

  // Subscribe to Supabase auth state changes so that when the access token is
  // automatically refreshed (every ~1 hour), we re-sync it to server cookies.
  // This keeps the server-side session alive for the full refresh-token TTL
  // without requiring the user to log in again.
  useEffect(() => {
    const supabase = getBrowserSupabaseClient();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      authLog(`onAuthStateChange: event="${event}" session=${session ? `✓ (user: ${session.user?.email ?? session.user?.id})` : "null"}`);

      if (event === 'TOKEN_REFRESHED' && session?.access_token && session?.refresh_token) {
        // Keep the cookie backup current whenever the token is refreshed
        // (Supabase rotates the refresh token on each refresh).
        authLog("onAuthStateChange: TOKEN_REFRESHED — updating backup cookie + server sync");
        backupRefreshToken(session.refresh_token);
        await syncSessionToServer(session.access_token, session.refresh_token);
      }

      if (event === 'SIGNED_IN' && session?.refresh_token) {
        // Also back up on initial sign-in (covers the login page path where
        // session is created and app is redirected to home).
        authLog("onAuthStateChange: SIGNED_IN — writing backup cookie");
        backupRefreshToken(session.refresh_token);
      }

      if (event === 'SIGNED_OUT') {
        authLog("onAuthStateChange: SIGNED_OUT — clearing backup cookie + server session");
        clearBackupRefreshToken();
        await clearServerSession();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    writeStoredValue(WORKSPACE_STORAGE_KEY, bootstrap.activeWorkspaceId);
  }, [bootstrap.activeWorkspaceId]);

  useEffect(() => {
    writeStoredValue(PROJECT_STORAGE_KEY, bootstrap.activeProjectId);
  }, [bootstrap.activeProjectId]);

  useEffect(() => {
    writeStoredValue(TOUR_STORAGE_KEY, bootstrap.activeTourId);
  }, [bootstrap.activeTourId]);

  const value = useMemo<AppContextValue>(() => ({
    ...bootstrap,
    isLoading,
    refreshContext,
    setActiveWorkspaceId: (workspaceId) => {
      setBootstrap((current) => {
        const nextProjects = current.projects.filter((project) => project.workspaceId === workspaceId);
        const nextProjectId = nextProjects.some((project) => project.id === current.activeProjectId)
          ? current.activeProjectId
          : nextProjects[0]?.id ?? null;
        const nextTours = current.tours.filter((tour) => tour.projectId === nextProjectId);
        const nextTourId = nextTours.some((tour) => tour.id === current.activeTourId)
          ? current.activeTourId
          : null;

        return {
          ...current,
          activeWorkspaceId: workspaceId,
          activeProjectId: nextProjectId,
          activeTourId: nextTourId,
        };
      });
    },
    setActiveProjectId: (projectId) => {
      setBootstrap((current) => {
        const nextTours = current.tours.filter((tour) => tour.projectId === projectId);
        const nextTourId = nextTours.some((tour) => tour.id === current.activeTourId)
          ? current.activeTourId
          : null;

        return {
          ...current,
          activeProjectId: projectId,
          activeTourId: nextTourId,
        };
      });
    },
    setActiveTourId: (tourId) => {
      setBootstrap((current) => ({
        ...current,
        activeTourId: tourId,
      }));
    },
  }), [bootstrap, isLoading, refreshContext]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const context = useContext(AppContext);

  if (!context) {
    throw new Error('useAppContext must be used within an AppContextProvider.');
  }

  return context;
}
