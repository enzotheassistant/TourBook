export type EditableWorkspaceMemberRole = 'owner' | 'admin' | 'editor' | 'viewer';
export type EditableWorkspaceScopeType = 'workspace' | 'projects' | 'tours';

export class MemberUpdateValidationError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function normalizeMemberRole(value: unknown): EditableWorkspaceMemberRole {
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw === 'owner' || raw === 'admin' || raw === 'editor' || raw === 'viewer') return raw;
  throw new MemberUpdateValidationError(400, 'role must be owner, admin, editor, or viewer.');
}

function normalizeScopeType(value: unknown): EditableWorkspaceScopeType {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw || raw === 'workspace') return 'workspace';
  if (raw === 'projects') return 'projects';
  if (raw === 'tours') return 'tours';
  return 'workspace';
}

export function validateWorkspaceMemberUpdatePayload(input: {
  role?: unknown;
  scopeType?: unknown;
  projectIds?: unknown;
  tourIds?: unknown;
}) {
  const role = normalizeMemberRole(input.role);
  const scopeType = normalizeScopeType(input.scopeType);
  const projectIds = Array.isArray(input.projectIds)
    ? [...new Set(input.projectIds.map((value) => String(value ?? '').trim()).filter(Boolean))]
    : [];
  const tourIds = Array.isArray(input.tourIds)
    ? [...new Set(input.tourIds.map((value) => String(value ?? '').trim()).filter(Boolean))]
    : [];

  if (role === 'admin' && scopeType !== 'workspace') {
    throw new MemberUpdateValidationError(400, 'Admins must have full workspace access.');
  }

  if (scopeType === 'projects' && projectIds.length === 0) {
    throw new MemberUpdateValidationError(400, 'Select at least one artist for project-scoped access.');
  }

  if (scopeType === 'tours' && tourIds.length === 0) {
    throw new MemberUpdateValidationError(400, 'Select at least one tour for tour-scoped access.');
  }

  return {
    role,
    scopeType,
    projectIds: scopeType === 'workspace' ? [] : projectIds,
    tourIds: scopeType === 'tours' ? tourIds : [],
  };
}
