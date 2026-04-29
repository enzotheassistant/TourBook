/**
 * Lightweight, production-safe session recovery and app resume debugging.
 *
 * Features:
 * - Timestamped console logging with distinctive [TourBook Session] tag
 * - Bounded in-memory event trail (max 50 events) for debugging via browser console
 * - No token values logged — only event names, user IDs, HTTP status codes, error types
 * - Supports both browser and server contexts
 */

export interface SessionRecoveryEvent {
  timestamp: string;
  event: string;
  details?: Record<string, unknown>;
}

class SessionRecoveryLog {
  private events: SessionRecoveryEvent[] = [];
  private readonly maxEvents = 50;

  log(event: string, details?: Record<string, unknown>): void {
    const timestamp = new Date().toISOString();
    const entry: SessionRecoveryEvent = { timestamp, event, details };

    // Keep bounded memory footprint
    if (this.events.length >= this.maxEvents) {
      this.events.shift();
    }
    this.events.push(entry);

    // Console output with timestamp
    const logLine = `[TourBook Session] ${timestamp} — ${event}`;
    if (details) {
      console.info(logLine, details);
    } else {
      console.info(logLine);
    }
  }

  /**
   * Get all captured events for inspection in browser dev tools.
   * Call via: window.sessionRecoveryLog?.getEvents() in browser console
   */
  getEvents(): SessionRecoveryEvent[] {
    return [...this.events];
  }

  /**
   * Clear the in-memory log.
   */
  clear(): void {
    this.events = [];
  }
}

// Singleton instance
const log = new SessionRecoveryLog();

// Expose globally in browser for dev console inspection
if (typeof window !== 'undefined') {
  (window as any).sessionRecoveryLog = log;
}

/**
 * Log a session recovery / app lifecycle event.
 * @param event - Event name (e.g., "app_resumed", "session_recovery_succeeded")
 * @param details - Optional metadata (user ID, HTTP status, error type — never token values)
 */
export function logSessionEvent(event: string, details?: Record<string, unknown>): void {
  log.log(event, details);
}

/**
 * Log app visibility change (PWA resume / background).
 */
export function logAppVisibility(visible: boolean): void {
  logSessionEvent('app_visibility_changed', {
    visible,
    visibilityState: typeof document !== 'undefined' ? document.visibilityState : 'unknown',
  });
}

/**
 * Log session bootstrap attempt (on app start).
 */
export function logBootstrapStart(): void {
  logSessionEvent('bootstrap_start');
}

/**
 * Log successful session retrieval from localStorage.
 */
export function logSessionFromStorage(userId: string | null): void {
  logSessionEvent('session_from_storage', {
    hasSession: !!userId,
    userId: userId || undefined,
  });
}

/**
 * Log backup refresh token status.
 */
export function logBackupTokenStatus(found: boolean, prefix?: string): void {
  logSessionEvent('backup_token_check', {
    found,
    prefix: prefix || undefined,
  });
}

/**
 * Log silent session recovery attempt.
 */
export function logSilentRecoveryAttempt(reason: string): void {
  logSessionEvent('silent_recovery_attempt', { reason });
}

/**
 * Log silent recovery result (success or failure with error type).
 */
export function logSilentRecoveryResult(
  success: boolean,
  errorType?: string,
  userId?: string
): void {
  logSessionEvent('silent_recovery_result', {
    success,
    errorType: errorType || undefined,
    userId: userId || undefined,
  });
}

/**
 * Log context fetch attempt (after session is established).
 */
export function logContextFetchStart(): void {
  logSessionEvent('context_fetch_start');
}

/**
 * Log context fetch result.
 */
export function logContextFetchResult(
  success: boolean,
  statusCode?: number,
  errorType?: string
): void {
  logSessionEvent('context_fetch_result', {
    success,
    statusCode: statusCode || undefined,
    errorType: errorType || undefined,
  });
}

/**
 * Log server session sync result.
 */
export function logServerSessionSync(
  success: boolean,
  statusCode?: number,
  errorType?: string
): void {
  logSessionEvent('server_session_sync', {
    success,
    statusCode: statusCode || undefined,
    errorType: errorType || undefined,
  });
}

/**
 * Log login redirect with reason.
 */
export function logLoginRedirect(reason: string, details?: Record<string, unknown>): void {
  logSessionEvent('login_redirect', {
    reason,
    ...details,
  });
}

/**
 * Log auth state change (SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, etc.).
 */
export function logAuthStateChange(
  event: string,
  hasSession: boolean,
  userId?: string
): void {
  logSessionEvent('auth_state_change', {
    event,
    hasSession,
    userId: userId || undefined,
  });
}

/**
 * Log error during session recovery (non-fatal).
 */
export function logSessionError(context: string, errorType: string, message?: string): void {
  logSessionEvent('session_error', {
    context,
    errorType,
    message: message || undefined,
  });
}
