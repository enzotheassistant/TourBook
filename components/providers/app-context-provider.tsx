'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { useRouter } from 'next/navigation';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
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
import {
  PROJECT_STORAGE_KEY,
  TOUR_STORAGE_KEY,
  WORKSPACE_STORAGE_KEY,
  clearAppContextStorage,
} from '@/lib/app-context-storage';

type AppContextValue = BootstrapContext & {
  isLoading: boolean;
  refreshContext: () => Promise<void>;
  resetContext: () => void;
  setActiveWorkspaceId: (workspaceId: string | null) => void;
  setActiveProjectId: (projectId: string | null) => void;
  setActiveTourId: (tourId: string | null) => void;
};

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

function resetBootstrapState(setBootstrap: Dispatch<SetStateAction<BootstrapContext>>) {
  clearAppContextStorage();
  setBootstrap(EMPTY_CONTEXT);
}

async function getOrRecoverBrowserSession(supabase: SupabaseClient): Promise<Session | null> {
  authLog('refreshContext: calling supabase.auth.getSession()…');
  let {
    data: { session },
  } = await supabase.auth.getSession();

  authLog(
    session
      ? `refreshContext: getSession() → session found ✓ (user: ${session.user?.email ?? session.user?.id}, expires: ${new Date((session.expires_at ?? 0) * 1000).toISOString()})`
      : 'refreshContext: getSession() → null — localStorage is empty or session expired',
  );

  if (session) {
    return session;
  }

  authLog('refreshContext: no session — checking for backup refresh token cookie…');
  const backupToken = getBackupRefreshTokenWithDiagnostics();
  if (!backupToken) {
    authLog('refreshContext: no backup token available');
    return null;
  }

  authLog('refreshContext: attempting silent recovery via refreshSession()…');
  const { data: recovered, error: refreshError } = await supabase.auth.refreshSession({
    refresh_token: backupToken,
  });

  if (!refreshError && recovered.session) {
    authLog(`refreshContext: silent recovery SUCCEEDED ✓ (user: ${recovered.session.user?.email ?? recovered.session.user?.id})`);
    return recovered.session;
  }

  authLog('refreshContext: silent recovery FAILED ✗', {
    error: refreshError?.message ?? refreshError,
    hasRecoveredSession: !!recovered.session,
  });
  clearBackupRefreshToken();
  return null;
}

async function syncSessionIfPresent(session: Session | null) {
  if (!session?.access_token || !session.refresh_token) {
    return;
  }

  backupRefreshToken(session.refresh_token);
  authLog('refreshContext: syncing session to server cookies…');
  await syncSessionToServer(session.access_token, session.refresh_token);
  authLog('refreshContext: server sync complete ✓');
}

async function fetchContext(session: Session | null) {
  return fetch('/api/me/context', {
    method: 'GET',
    headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
    credentials: 'same-origin',
    cache: 'no-store',
  });
}

export function AppContextProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [bootstrap, setBootstrap] = useState<BootstrapContext>(EMPTY_CONTEXT);
  const [isLoading, setIsLoading] = useState(true);

  const refreshContext = useCallback(async () => {
    setIsLoading(true);

    try {
      const supabase = getBrowserSupabaseClient();
      let session = await getOrRecoverBrowserSession(supabase);

      if (!session) {
        authLog('refreshContext: unable to establish browser session — redirecting to /login');
        resetBootstrapState(setBootstrap);
        router.replace('/login');
        router.refresh();
        return;
      }

      await syncSessionIfPresent(session);

      let response = await fetchContext(session);

      if (response.status === 401) {
        authLog('refreshContext: /api/me/context returned 401 — attempting repair-before-redirect');
        session = await getOrRecoverBrowserSession(supabase);

        if (session) {
          await syncSessionIfPresent(session);
          response = await fetchContext(session);
        }
      }

      if (response.status === 401) {
        authLog('refreshContext: repair failed — redirecting to /login');
        resetBootstrapState(setBootstrap);
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

  // Refresh context whenever the PWA comes to the foreground (visibilitychange).
  // This handles the case where the OS suspends the app and the session expires
  // while the tab is hidden, ensuring a fresh session on resume.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refreshContext();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refreshContext]);

  // Subscribe to Supabase auth state changes so that when the access token is
  // automatically refreshed (every ~1 hour), we re-sync it to server cookies.
  // This keeps the server-side session alive for the full refresh-token TTL
  // without requiring the user to log in again.
  useEffect(() => {
    const supabase = getBrowserSupabaseClient();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      authLog(`onAuthStateChange: event="${event}" session=${session ? `✓ (user: ${session.user?.email ?? session.user?.id})` : 'null'}`);

      if (event === 'TOKEN_REFRESHED' && session?.access_token && session?.refresh_token) {
        // Keep the cookie backup current whenever the token is refreshed
        // (Supabase rotates the refresh token on each refresh).
        authLog('onAuthStateChange: TOKEN_REFRESHED — updating backup cookie + server sync');
        backupRefreshToken(session.refresh_token);
        await syncSessionToServer(session.access_token, session.refresh_token);
      }

      if (event === 'SIGNED_IN' && session?.refresh_token) {
        // Also back up on initial sign-in (covers the login page path where
        // session is created and app is redirected to home).
        authLog('onAuthStateChange: SIGNED_IN — writing backup cookie');
        backupRefreshToken(session.refresh_token);
      }

      if (event === 'SIGNED_OUT') {
        authLog('onAuthStateChange: SIGNED_OUT — clearing backup cookie + server session');
        clearBackupRefreshToken();
        try {
          await clearServerSession();
        } catch (error) {
          authLog('onAuthStateChange: SIGNED_OUT — server session clear failed', error);
        }
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
    resetContext: () => {
      resetBootstrapState(setBootstrap);
    },
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
