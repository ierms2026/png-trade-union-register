import { Phone, Mail, MapPin, Clock } from "lucide-react";
import { getRegistrarContact, hasRegistrarContact } from "@/lib/registrar-contact";

// =============================================================================
// RegistrarContactInfo — shared block showing the Office of The Industrial
// Registrar's contact details. Used in:
//   - The public portal footer (every public page)
//   - The union record page's "For enquiries regarding this union…" card
//
// Rendering is server-side (this is a Server Component). The contact values
// are read from env vars at module-load time, so they're consistent across
// every page render.
//
// If NO contact env vars are configured, this component renders nothing —
// callers don't need to gate it. This keeps the unconfigured case clean
// (no empty card, no "Contact: undefined" line).
// =============================================================================

interface Props {
  /**
   * "compact" renders the contact details as a single inline line (footer
   * style). "card" renders them as a stacked block with icons (enquiry-card
   * style). The data is the same; only the layout differs.
   */
  variant?: "compact" | "card";
  /**
   * Optional extra class on the wrapper. Useful for tweaking spacing in
   * specific call sites without rewriting the inner layout.
   */
  className?: string;
}

export function RegistrarContactInfo({ variant = "compact", className }: Props) {
  if (!hasRegistrarContact()) return null;
  const c = getRegistrarContact();

  if (variant === "card") {
    return (
      <div className={className}>
        <p className="mb-3 text-sm font-semibold text-foreground">Contact the Office of The Industrial Registrar</p>
        <div className="space-y-2 text-sm text-muted-foreground">
          {c.phone && (
            <div className="flex items-start gap-2">
              <Phone className="mt-0.5 h-4 w-4 shrink-0 text-accent-foreground" />
              <a href={`tel:${c.phone.replace(/\s+/g, "")}`} className="hover:text-foreground hover:underline underline-offset-4">
                {c.phone}
              </a>
            </div>
          )}
          {c.email && (
            <div className="flex items-start gap-2">
              <Mail className="mt-0.5 h-4 w-4 shrink-0 text-accent-foreground" />
              <a href={`mailto:${c.email}`} className="hover:text-foreground hover:underline underline-offset-4 break-all">
                {c.email}
              </a>
            </div>
          )}
          {c.address && (
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-accent-foreground" />
              <span className="whitespace-pre-line">{c.address}</span>
            </div>
          )}
          {c.hours && (
            <div className="flex items-start gap-2">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-accent-foreground" />
              <span>{c.hours}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // compact variant — single inline line, separators between non-null fields
  const parts: string[] = [];
  if (c.phone) parts.push(`Phone: ${c.phone}`);
  if (c.email) parts.push(`Email: ${c.email}`);
  if (c.address) parts.push(c.address);
  return (
    <p className={className}>
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 && <span className="mx-1.5 text-muted-foreground/40">·</span>}
          {p}
        </span>
      ))}
    </p>
  );
}
