const TRUE_LIKE_VALUES = new Set(['1', 'true', 'yes', 'on']);

type LegacyFlagConfig = {
  envVar: string;
  endpoint: string;
};

const LEGACY_FLAG_CONFIG = {
  showsApi: {
    envVar: 'LEGACY_SHOWS_API_ENABLED',
    endpoint: '/api/shows/*',
  },
  guestListApi: {
    envVar: 'LEGACY_GUEST_LIST_API_ENABLED',
    endpoint: '/api/guest-list/[id]',
  },
  aiIntakeApi: {
    envVar: 'LEGACY_AI_INTAKE_API_ENABLED',
    endpoint: '/api/ai-intake',
  },
} as const satisfies Record<string, LegacyFlagConfig>;

export type LegacyFlagName = keyof typeof LEGACY_FLAG_CONFIG;

export const LEGACY_DEPRECATION_CODE = 'LEGACY_ENDPOINT_DISABLED';
export const LEGACY_DEPRECATION_STATUS = 410;

function parseEnabledFlag(rawValue: string | undefined) {
  if (rawValue == null || rawValue.trim() === '') return true;
  return TRUE_LIKE_VALUES.has(rawValue.trim().toLowerCase());
}

export function isLegacyEndpointEnabled(flagName: LegacyFlagName) {
  const { envVar } = LEGACY_FLAG_CONFIG[flagName];
  return parseEnabledFlag(process.env[envVar]);
}

export function getLegacyFlagEnvVar(flagName: LegacyFlagName) {
  return LEGACY_FLAG_CONFIG[flagName].envVar;
}

export function getLegacyEndpointPattern(flagName: LegacyFlagName) {
  return LEGACY_FLAG_CONFIG[flagName].endpoint;
}

export function getLegacyDeprecationPayload(flagName: LegacyFlagName) {
  return {
    code: LEGACY_DEPRECATION_CODE,
    message: `${LEGACY_FLAG_CONFIG[flagName].endpoint} is deprecated and has been disabled.`,
  };
}
