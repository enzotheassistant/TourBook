import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LEGACY_DEPRECATION_CODE,
  LEGACY_DEPRECATION_STATUS,
  getLegacyDeprecationPayload,
  getLegacyFlagEnvVar,
  isLegacyEndpointEnabled,
} from './legacy-flags.ts';

function withEnv(name, value, fn) {
  const previous = process.env[name];
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }

  try {
    return fn();
  } finally {
    if (previous === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = previous;
    }
  }
}

test('legacy flags default to enabled when env vars are unset', () => {
  withEnv('LEGACY_SHOWS_API_ENABLED', undefined, () => {
    assert.equal(isLegacyEndpointEnabled('showsApi'), true);
  });
  withEnv('LEGACY_GUEST_LIST_API_ENABLED', undefined, () => {
    assert.equal(isLegacyEndpointEnabled('guestListApi'), true);
  });
  withEnv('LEGACY_AI_INTAKE_API_ENABLED', undefined, () => {
    assert.equal(isLegacyEndpointEnabled('aiIntakeApi'), true);
  });
});

test('legacy flags can disable a target endpoint', () => {
  withEnv('LEGACY_SHOWS_API_ENABLED', 'false', () => {
    assert.equal(isLegacyEndpointEnabled('showsApi'), false);
  });
});

test('shows endpoint gate payload uses consistent deprecation shape', () => {
  const payload = getLegacyDeprecationPayload('showsApi');

  assert.equal(LEGACY_DEPRECATION_STATUS, 410);
  assert.equal(payload.code, LEGACY_DEPRECATION_CODE);
  assert.match(payload.message, /\/api\/shows\/\*/);
  assert.equal(getLegacyFlagEnvVar('showsApi'), 'LEGACY_SHOWS_API_ENABLED');
});
