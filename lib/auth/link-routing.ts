// Where should an email link (from the sign-in service) really go?
//
// Password reset links must always open "Set a new password" — never just
// sign someone in. If the sign-in service sends the link to the wrong page
// (e.g. the home page, when the reset page isn't on its list of allowed
// return pages), this catches it and forwards it, keeping the secret part of
// the link (after "#") intact.
//
// Links that have expired or were already used go to sign-in with a clear
// message and a way to request a new one, instead of a blank page.
//
// IMPORTANT: this function is also inlined into a tiny script that runs before
// the app loads (see app/layout.tsx), so it must stay self-contained: no
// imports, no outside variables, plain JavaScript features only.

export function routeForAuthLink(location: { pathname: string; search: string; hash: string }): string | null {
  var pathname = location.pathname || '/';
  var search = location.search || '';
  var hash = location.hash || '';
  var hashParams = new URLSearchParams(hash.charAt(0) === '#' ? hash.slice(1) : hash);
  var queryParams = new URLSearchParams(search.charAt(0) === '?' ? search.slice(1) : search);

  var isResetPage = pathname === '/reset-password';
  var isRecovery = hashParams.get('type') === 'recovery' || queryParams.get('type') === 'recovery';

  // A password reset link that landed anywhere but the reset page.
  if (isRecovery && !isResetPage) {
    return '/reset-password' + search + hash;
  }

  // An expired or already-used link (the reset page handles its own).
  var errorCode = hashParams.get('error_code') || queryParams.get('error_code') || '';
  var hasError = !!errorCode || !!hashParams.get('error_description');
  var handlesOwnErrors = isResetPage || pathname.indexOf('/invite/') === 0 || pathname === '/accept-invite' || pathname === '/login';
  if (hasError && !handlesOwnErrors) {
    return '/login?link=' + (errorCode === 'otp_expired' ? 'expired' : 'invalid');
  }

  return null;
}

/** Where the reset page finds the secret part of the link if the app tidied it out of the address first. */
export const RECOVERY_HASH_STORAGE_KEY = 'tourbook_recovery_link';

/**
 * The script that runs before the app loads, built from the function above.
 * On the reset page it also keeps a copy of the link's secret part for a few
 * moments, because the sign-in library tidies it out of the address bar as
 * soon as it starts.
 */
export function authLinkRedirectScript() {
  return '(function(){try{'
    + 'var target=(' + routeForAuthLink.toString() + ')({pathname:location.pathname,search:location.search,hash:location.hash});'
    + 'if(target){location.replace(target);return;}'
    + 'if(location.pathname===\'/reset-password\'&&/(^|[#&])(type=recovery|error_code=)/.test(location.hash)){'
    + 'sessionStorage.setItem(\'' + RECOVERY_HASH_STORAGE_KEY + '\',location.hash);}'
    + '}catch(e){}})();';
}
