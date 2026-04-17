# PHASE 8 Plan — Self-Serve Onboarding & Workspace Creation

## Objective
Enable a true self-serve first-run experience: a new authenticated user with no memberships can create their own workspace, create a first artist, and immediately land in a usable workspace/project context.

## Scope

### Batch 1 (this delivery)
1. **First-run detection + guided setup entry (minimal UI)**
   - Detect authenticated users with no workspace memberships.
   - Show lightweight onboarding panel in existing dashboard surface.
   - Collect:
     - workspace name
     - first artist name
     - optional “skip tour setup for now” toggle

2. **API/data support**
   - Add workspace creation API endpoint for authenticated users.
   - Create workspace with owner assignment to current user.
   - Create owner membership row with workspace scope.
   - Reuse existing scoped project create API for first artist.

3. **Context landing behavior**
   - Refresh bootstrap context after onboarding completion.
   - Ensure active workspace + active project are auto-resolved as valid selections.

4. **Safety/compatibility**
   - Existing users with memberships continue normal flow.
   - Invite acceptance and team/invite flows remain intact.

### Batch 2 (next)
- Optional tour creation step in onboarding (with lightweight defaults).
- Better onboarding state transitions / success confirmations.
- Deeper telemetry coverage for onboarding funnel.
- Extra safeguards for partially completed setup and recoverability.

## Success Criteria
- New user can complete onboarding without manual admin intervention.
- New workspace owner and first artist are created via scoped APIs.
- User lands in active workspace/project context and can use dashboard/admin flows.
- Existing invited/team users are unaffected.
