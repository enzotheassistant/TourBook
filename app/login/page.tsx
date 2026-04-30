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
export default async function LoginPage() {
  // Read the remembered email and remember-email preference server-side at render time.
  // This is more reliable than fetching it client-side in a useEffect, especially for
  // PWAs where the app might be evicted and reopened with a hard-close.
  const rememberedEmail = await getRememberedEmailFromCookies();
  const rememberEmailByDefault = await getRememberEmailPreferenceFromCookies();

  return <LoginPageClient initialEmail={rememberedEmail} initialRememberEmail={rememberEmailByDefault} />;
}
