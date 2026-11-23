import test from 'node:test';
import assert from 'node:assert/strict';
import { authLinkRedirectScript, routeForAuthLink } from './link-routing.ts';

const recoveryHash = '#access_token=abc&refresh_token=def&type=recovery&expires_in=3600';

test('a reset link that lands on the home page goes to Set a new password, secret part kept', () => {
  assert.equal(routeForAuthLink({ pathname: '/', search: '', hash: recoveryHash }), `/reset-password${recoveryHash}`);
});

test('a reset link that lands on another page (with an invite) is forwarded too', () => {
  assert.equal(
    routeForAuthLink({ pathname: '/shows/123', search: '?inviteToken=xyz', hash: recoveryHash }),
    `/reset-password?inviteToken=xyz${recoveryHash}`,
  );
});

test('newer-style reset links (token in the address) are forwarded', () => {
  assert.equal(
    routeForAuthLink({ pathname: '/', search: '?token_hash=t1&type=recovery', hash: '' }),
    '/reset-password?token_hash=t1&type=recovery',
  );
});

test('a reset link already on the reset page is left alone', () => {
  assert.equal(routeForAuthLink({ pathname: '/reset-password', search: '', hash: recoveryHash }), null);
});

test('expired or used links go to sign-in with a message', () => {
  assert.equal(
    routeForAuthLink({ pathname: '/', search: '', hash: '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired' }),
    '/login?link=expired',
  );
  assert.equal(routeForAuthLink({ pathname: '/', search: '', hash: '#error=server_error&error_description=oops' }), '/login?link=invalid');
});

test('pages that handle their own link errors are left alone', () => {
  const expired = '#error=access_denied&error_code=otp_expired';
  assert.equal(routeForAuthLink({ pathname: '/reset-password', search: '', hash: expired }), null);
  assert.equal(routeForAuthLink({ pathname: '/invite/abc', search: '', hash: expired }), null);
});

test('normal pages and sign-in links are untouched', () => {
  assert.equal(routeForAuthLink({ pathname: '/', search: '', hash: '' }), null);
  assert.equal(routeForAuthLink({ pathname: '/', search: '', hash: '#access_token=a&refresh_token=b&type=signup' }), null);
  assert.equal(routeForAuthLink({ pathname: '/admin/dates', search: '?view=x', hash: '#section' }), null);
});

test('the before-load script is valid JavaScript and forwards a reset link', () => {
  const script = authLinkRedirectScript();
  let replaced = null;
  const fakeLocation = { pathname: '/', search: '', hash: recoveryHash, replace: (to) => { replaced = to; } };
  new Function('location', script)(fakeLocation);
  assert.equal(replaced, `/reset-password${recoveryHash}`);
});

test('on the reset page, the before-load script keeps a copy of the link for the page', () => {
  const store = {};
  const fakeLocation = { pathname: '/reset-password', search: '', hash: recoveryHash, replace: () => { throw new Error('should not redirect'); } };
  const fakeSession = { setItem: (key, value) => { store[key] = value; } };
  new Function('location', 'sessionStorage', authLinkRedirectScript())(fakeLocation, fakeSession);
  assert.equal(store.tourbook_recovery_link, recoveryHash);
});
