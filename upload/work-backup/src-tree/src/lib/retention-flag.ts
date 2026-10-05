// =============================================================================
// Retention feature flag — controls whether the retention/disposition/
// legal-hold workflow is visible + callable.
//
// When NEXT_PUBLIC_RETENTION_ENABLED is not set (or set to "false"), ALL
// retention surfaces are hidden:
//   - The "Retention Queue" nav entry + view are removed
//   - The /api/retention, /api/legal-holds, /api/dispositions routes return 404
//   - The cron sweep routes are no-ops
//
// When NEXT_PUBLIC_RETENTION_ENABLED=true, everything works as before.
//
// WHY THIS EXISTS:
//   The retention workflow allows a Registrar to dispose of real records.
//   That's a destructive, irreversible action. Until the office is ready
//   to use it (retention rules are configured, staff are trained, the
//   Registrar has signed off on the policy), the feature is hidden so
//   nobody can accidentally dispose of real records.
//
// WHY NEXT_PUBLIC_:
//   The flag needs to be readable by BOTH server code (API routes, cron)
//   AND client code (nav structure, page.tsx's view switch). NEXT_PUBLIC_
//   vars are inlined at build time and available in both environments.
//   The flag is not sensitive — it's just "is this feature turned on" —
//   so exposing it to the client is fine.
//
// To enable: set NEXT_PUBLIC_RETENTION_ENABLED=true in .env
// =============================================================================

/**
 * Returns true if the retention/disposition/legal-hold workflow is enabled.
 *
 * Reads NEXT_PUBLIC_RETENTION_ENABLED. Works in both server and client
 * code (the var is inlined at build time).
 */
export function isRetentionEnabled(): boolean {
  return process.env.NEXT_PUBLIC_RETENTION_ENABLED === "true";
}

/**
 * Guard message for API routes when retention is disabled.
 * Used by the retention/disposition/legal-hold routes to return a 404
 * when the flag is off — defense in depth so nobody can dispose of real
 * records by hitting the URL directly.
 */
export const RETENTION_DISABLED_MESSAGE =
  "The retention workflow is not enabled. Set NEXT_PUBLIC_RETENTION_ENABLED=true to enable it.";
