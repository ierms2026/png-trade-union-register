// =============================================================================
// Contact details for the Office of The Industrial Registrar.
//
// These are surfaced on the public site (footer of every public page + the
// union record page's enquiry card). Only the Registrar's Office can supply
// the real values, so they're configured via environment variables rather
// than stored in the DB:
//
//   NEXT_PUBLIC_REGISTRAR_PHONE    — office phone, e.g. "+675 312 3456"
//   NEXT_PUBLIC_REGISTRAR_EMAIL    — office email, e.g. "registrar@labour.gov.pg"
//   NEXT_PUBLIC_REGISTRAR_ADDRESS  — postal / street address, e.g.
//                                    "PO Box 1234, Port Moresby, PNG"
//   NEXT_PUBLIC_REGISTRAR_HOURS    — optional office hours, e.g.
//                                    "Mon–Fri, 8:00am – 4:30pm PNG time"
//
// All four are NEXT_PUBLIC_* so Next.js's static analysis inlines them at
// build time and they're visible to BOTH server components (the union record
// page) and client components (the public portal footer). This keeps the
// contact details consistent everywhere they appear.
//
// IMPORTANT — STATIC `process.env` REFERENCES:
//   Next.js only inlines NEXT_PUBLIC_* env vars when they're referenced as
//   literal `process.env.NEXT_PUBLIC_FOO` expressions. Dynamic access like
//   `process.env[name]` does NOT get inlined and would be `undefined` on
//   the client. So we read each var with a literal reference here.
//
// FALLBACKS:
//   If an env var is missing, the corresponding field is `null`. The
//   footer / enquiry card only renders the line if the value is non-null,
//   so an unconfigured deployment shows a slimmer block of details rather
//   than "Contact: undefined".
// =============================================================================

export interface RegistrarContact {
  phone: string | null;
  email: string | null;
  address: string | null;
  hours: string | null;
}

function trimOrNull(v: string | undefined): string | null {
  if (v == null) return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Read the Registrar's contact details from the environment.
 *
 * Returns a plain object with `null` for any field that isn't configured.
 * Callers should render each field conditionally so missing values don't
 * show up as empty lines.
 *
 * SAFE FOR CLIENT-SIDE USE: each env var is referenced as a literal
 * `process.env.NEXT_PUBLIC_*` expression, so Next.js inlines the values
 * at build time and they're available in both server and client components.
 */
export function getRegistrarContact(): RegistrarContact {
  return {
    // Each of these must be a literal `process.env.NEXT_PUBLIC_*` reference
    // — see the module comment for why dynamic access doesn't work on the
    // client.
    phone: trimOrNull(process.env.NEXT_PUBLIC_REGISTRAR_PHONE),
    email: trimOrNull(process.env.NEXT_PUBLIC_REGISTRAR_EMAIL),
    address: trimOrNull(process.env.NEXT_PUBLIC_REGISTRAR_ADDRESS),
    hours: trimOrNull(process.env.NEXT_PUBLIC_REGISTRAR_HOURS),
  };
}

/**
 * True if at least one contact field is configured. Used by the footer /
 * enquiry card to decide whether to render the contact block at all (so
 * an unconfigured deployment shows nothing rather than an empty card).
 */
export function hasRegistrarContact(): boolean {
  const c = getRegistrarContact();
  return Boolean(c.phone || c.email || c.address || c.hours);
}
