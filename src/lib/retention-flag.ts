// =============================================================================
// Retention feature flag — controls whether the retention/disposition/
// legal-hold workflow is visible + callable.
//
// When the flag is not set (or set to "false"), ALL retention surfaces are
// hidden:
//   - The "Retention Queue" nav entry + view are removed
//   - The /api/retention, /api/legal-holds, /api/dispositions routes return 404
//   - The cron sweep routes are no-ops
//
// When the flag is "true", everything works as before.
//
// WHY THIS EXISTS:
//   The retention workflow allows a Registrar to dispose of real records.
//   That's a destructive, irreversible action. Until the office is ready
//   to use it (retention rules are configured, staff are trained, the
//   Registrar has signed off on the policy), the feature is hidden so
//   nobody can accidentally dispose of real records.
//
// WHY THE ENV VAR NAME IS NOT IN THE 404 BODY (decision D5):
//   The 404 body returned by retention routes must be a generic "not found"
//   message. Naming the env var in the body would leak implementation detail
//   to anyone hitting the URL — including parties who shouldn't know the
//   feature exists. The enable instruction lives in .env.example + the
//   README, not in the response body.
//
// To enable: see .env.example for the variable name + how to set it.
// =============================================================================

/**
 * Returns true if the retention/disposition/legal-hold workflow is enabled.
 * Works in both server and client code (the var is inlined at build time).
 */
export function isRetentionEnabled(): boolean {
  return process.env.NEXT_PUBLIC_RETENTION_ENABLED === "true";
}

/**
 * Guard message for API routes when retention is disabled.
 *
 * Generic "not found" wording — does NOT name the env var (decision D5).
 * Used by the retention/disposition/legal-hold routes to return a 404 when
 * the flag is off, as defense in depth so nobody can dispose of real records
 * by hitting the URL directly.
 */
export const RETENTION_DISABLED_MESSAGE = "Not found.";
