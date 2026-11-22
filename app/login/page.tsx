import { getRememberEmailPreferenceFromCookies, getRememberedEmailFromCookies } from "@/lib/auth";
import { LoginPageClient } from "./login-client";

/**
 * Server Component: Reads the remembered email from the HTTP-only cookie server-side.
 * This ensures the email is available at initial render without depending on client-side
 * effect timing or useEffect execution, which is critical for PWA contexts where
 * hard-close and reopen might not preserve client-side state.
 * 
 * The remembered email is passed to the client component as an initial prop for instant prefill.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ inviteToken?: string; token?: string; mode?: string; link?: string }>;
}) {
  // Read the remembered email and remember-email preference server-side at render time.
  // This is more reliable than fetching it client-side in a useEffect, especially for
  // PWAs where the app might be evicted and reopened with a hard-close.
  const rememberedEmail = await getRememberedEmailFromCookies();
  const rememberEmailByDefault = await getRememberEmailPreferenceFromCookies();
  const params = await searchParams;
  const inviteToken = String(params?.inviteToken ?? params?.token ?? '').trim();
  // ?mode=forgot opens straight on "Reset password" (e.g. from an expired reset link).
  const initialMode = params?.mode === 'forgot' ? 'forgot' : 'signin';
  // ?link=expired|invalid explains an email link that no longer works.
  const linkProblem = params?.link === 'expired' || params?.link === 'invalid' ? params.link : undefined;

  return (
    <LoginPageClient
      initialEmail={rememberedEmail}
      initialRememberEmail={rememberEmailByDefault}
      inviteToken={inviteToken}
      initialMode={initialMode}
      linkProblem={linkProblem}
    />
  );
}
