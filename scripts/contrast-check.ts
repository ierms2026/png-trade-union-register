// =============================================================================
// contrast-check.ts — compute WCAG contrast ratios for status badge colors.
//
// Verifies that every status badge in the UI meets WCAG AA (4.5:1 for normal
// text, 3:1 for large text ≥18pt or ≥14pt bold). Status badges use ~12px
// text (small), so the 4.5:1 target applies.
//
// OKLCH values are taken from src/app/globals.css. The /15, /30 opacity
// modifiers in the Tailwind classes are computed by treating the badge bg
// as the source color over an opaque white (light mode) or card bg (dark
// mode) backing, using the standard source-over alpha compositing formula.
//
// USAGE: npx tsx scripts/contrast-check.ts
// =============================================================================

import { execSync } from "node:child_process";

// --- OKLCH → sRGB conversion ----------------------------------------------
// We use a direct numerical implementation (no color.js dependency).

function oklchToLinearSrgb(L: number, C: number, H: number): [number, number, number] {
  // OKLab → linear sRGB. H is in degrees.
  const hRad = (H * Math.PI) / 180;
  const a = C * Math.cos(hRad);
  const b = C * Math.sin(hRad);

  // OKLab from LCH
  const labL = L;
  const labA = a;
  const labB = b;

  // OKLab → linear RGB (per Björn Ottosson's spec)
  const l_ = labL + 0.3963377774 * labA + 0.2158037573 * labB;
  const m_ = labL - 0.1055613458 * labA - 0.0638541728 * labB;
  const s_ = labL - 0.0894841775 * labA - 1.2914855480 * labB;

  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;

  return [
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574051 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
}

function linearToSrgb(c: number): number {
  // Inverse sRGB transfer function
  if (c <= 0) return 0;
  if (c >= 1) return 255;
  return Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055));
}

function oklchToSrgb(L: number, C: number, H: number): [number, number, number] {
  const [r, g, b] = oklchToLinearSrgb(L, C, H);
  return [linearToSrgb(r), linearToSrgb(g), linearToSrgb(b)];
}

// --- Relative luminance + contrast (WCAG 2.1) -----------------------------

function srgbToLinear(c8bit: number): number {
  const c = c8bit / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const R = srgbToLinear(r);
  const G = srgbToLinear(g);
  const B = srgbToLinear(b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function contrastRatio(fg: [number, number, number], bg: [number, number, number]): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// --- Source-over alpha compositing ----------------------------------------
// badge bg = source color with alpha A, composited over backing color.
// Result = source * A + backing * (1 - A).

function compositeOver(
  source: [number, number, number],
  alpha: number,
  backing: [number, number, number],
): [number, number, number] {
  return [
    Math.round(source[0] * alpha + backing[0] * (1 - alpha)),
    Math.round(source[1] * alpha + backing[1] * (1 - alpha)),
    Math.round(source[2] * alpha + backing[2] * (1 - alpha)),
  ];
}

// --- OKLCH tokens from globals.css ----------------------------------------

const LIGHT = {
  card: oklchToSrgb(1, 0, 0), // --card
  chart3: oklchToSrgb(0.58, 0.13, 165),
  chart4: oklchToSrgb(0.60, 0.19, 15),
  destructive: oklchToSrgb(0.577, 0.245, 27.325),
  accent: oklchToSrgb(0.74, 0.15, 85), // gold
  accentFg: oklchToSrgb(0.20, 0.02, 50),
  muted: oklchToSrgb(0.95, 0.01, 80),
  mutedFg: oklchToSrgb(0.50, 0.02, 60),
  foreground: oklchToSrgb(0.20, 0.02, 50),
  blue100: [219, 234, 254] as [number, number, number], // tailwind blue-100
  blue800: [30, 64, 175] as [number, number, number], // tailwind blue-800
  amber100: [254, 243, 199] as [number, number, number], // tailwind amber-100
  amber800: [146, 64, 14] as [number, number, number], // tailwind amber-800
  green100: [220, 252, 231] as [number, number, number], // tailwind green-100
  green800: [22, 101, 52] as [number, number, number], // tailwind green-800
  red100: [254, 226, 226] as [number, number, number], // tailwind red-100
  red800: [153, 27, 27] as [number, number, number], // tailwind red-800
};

const DARK = {
  card: oklchToSrgb(0.22, 0.02, 255),
  chart3: oklchToSrgb(0.68, 0.14, 165),
  chart4: oklchToSrgb(0.70, 0.19, 15),
  destructive: oklchToSrgb(0.704, 0.191, 22.216),
  accent: oklchToSrgb(0.74, 0.15, 85),
  accentFg: oklchToSrgb(0.18, 0.02, 255),
  muted: oklchToSrgb(0.28, 0.02, 255),
  mutedFg: oklchToSrgb(0.68, 0.015, 80),
  foreground: oklchToSrgb(0.95, 0.008, 80),
  blue100: [219, 234, 254] as [number, number, number],
  blue800: [30, 64, 175] as [number, number, number],
  blue950: [49, 46, 129] as [number, number, number], // used as 30% bg
  blue300: [147, 197, 253] as [number, number, number],
  amber100: [254, 243, 199] as [number, number, number],
  amber800: [146, 64, 14] as [number, number, number],
  amber950: [69, 26, 3] as [number, number, number],
  amber300: [252, 211, 77] as [number, number, number],
  green100: [220, 252, 231] as [number, number, number],
  green800: [22, 101, 52] as [number, number, number],
  green950: [20, 83, 45] as [number, number, number],
  green300: [134, 239, 172] as [number, number, number],
  red100: [254, 226, 226] as [number, number, number],
  red800: [153, 27, 27] as [number, number, number],
  red950: [127, 29, 29] as [number, number, number],
  red300: [252, 165, 165] as [number, number, number],
};

interface CheckResult {
  name: string;
  mode: "light" | "dark";
  fgLabel: string;
  bgLabel: string;
  fg: [number, number, number];
  bg: [number, number, number];
  ratio: number;
  pass: boolean;
}

function check(name: string, fg: [number, number, number], bg: [number, number, number], mode: "light" | "dark", fgLabel: string, bgLabel: string): CheckResult {
  const ratio = contrastRatio(fg, bg);
  return {
    name,
    mode,
    fgLabel,
    bgLabel,
    fg,
    bg,
    ratio,
    pass: ratio >= 4.5,
  };
}

const results: CheckResult[] = [];

// === ComplianceStatusBadge (status-badge.tsx + compliance-status-badge.tsx) ===
// STEP 6 (polish): badges now use Tailwind color stops (not chart tokens).
// We composite bg/X over card for the /30 dark-mode backgrounds.

// --- Light mode ---
// All light-mode badges use solid tailwind 100-stop backgrounds (no alpha).
// ACTIVE/COMPLIANT: bg-green-100 text-green-800
results.push(check(
  "Union ACTIVE (light)", LIGHT.green800, LIGHT.green100,
  "light", "green-800", "green-100",
));
// SUSPENDED/EXPIRING: bg-amber-100 text-amber-800
results.push(check(
  "Union SUSPENDED (light)", LIGHT.amber800, LIGHT.amber100,
  "light", "amber-800", "amber-100",
));
// DEREGISTERED: bg-muted text-muted-foreground
results.push(check(
  "Union DEREGISTERED (light)", LIGHT.mutedFg, compositeOver(LIGHT.muted, 1.0, LIGHT.card),
  "light", "muted-foreground", "muted over card",
));

// ComplianceStatusBadge (same Tailwind pairs now)
results.push(check(
  "Compliance COMPLIANT (light)", LIGHT.green800, LIGHT.green100,
  "light", "green-800", "green-100",
));
results.push(check(
  "Compliance EXPIRING (light)", LIGHT.amber800, LIGHT.amber100,
  "light", "amber-800", "amber-100",
));
results.push(check(
  "Compliance OVERDUE (light)", LIGHT.red800, LIGHT.red100,
  "light", "red-800", "red-100",
));
results.push(check(
  "Compliance AWAITING_REVIEW (light)", LIGHT.blue800, LIGHT.blue100,
  "light", "blue-800", "blue-100",
));
results.push(check(
  "Compliance MISSING (light)", LIGHT.mutedFg, compositeOver(LIGHT.muted, 1.0, LIGHT.card),
  "light", "muted-foreground", "muted",
));
results.push(check(
  "Compliance NOT_APPLICABLE (light)", LIGHT.mutedFg, compositeOver(LIGHT.muted, 0.50, LIGHT.card),
  "light", "muted-foreground", "muted/50 over card",
));

// Review status badge (PENDING/APPROVED/REJECTED — hardcoded tailwind)
results.push(check(
  "Review PENDING (light)", LIGHT.amber800, LIGHT.amber100,
  "light", "amber-800", "amber-100",
));
results.push(check(
  "Review APPROVED (light)", LIGHT.green800, LIGHT.green100,
  "light", "green-800", "green-100",
));
results.push(check(
  "Review REJECTED (light)", LIGHT.red800, LIGHT.red100,
  "light", "red-800", "red-100",
));

// --- Dark mode ---
// Dark mode badges use bg-X-950/30 (30% alpha) over the dark card.
results.push(check(
  "Union ACTIVE (dark)", DARK.green300, compositeOver(DARK.green950, 0.30, DARK.card),
  "dark", "green-300", "green-950/30 over card",
));
results.push(check(
  "Union SUSPENDED (dark)", DARK.amber300, compositeOver(DARK.amber950, 0.30, DARK.card),
  "dark", "amber-300", "amber-950/30 over card",
));
results.push(check(
  "Union DEREGISTERED (dark)", DARK.mutedFg, compositeOver(DARK.muted, 1.0, DARK.card),
  "dark", "muted-foreground", "muted over card",
));
results.push(check(
  "Compliance COMPLIANT (dark)", DARK.green300, compositeOver(DARK.green950, 0.30, DARK.card),
  "dark", "green-300", "green-950/30 over card",
));
results.push(check(
  "Compliance EXPIRING (dark)", DARK.amber300, compositeOver(DARK.amber950, 0.30, DARK.card),
  "dark", "amber-300", "amber-950/30 over card",
));
results.push(check(
  "Compliance OVERDUE (dark)", DARK.red300, compositeOver(DARK.red950, 0.30, DARK.card),
  "dark", "red-300", "red-950/30 over card",
));
results.push(check(
  "Compliance AWAITING_REVIEW (dark)", DARK.blue300, compositeOver(DARK.blue950, 0.30, DARK.card),
  "dark", "blue-300", "blue-950/30 over card",
));
results.push(check(
  "Compliance MISSING (dark)", DARK.mutedFg, compositeOver(DARK.muted, 1.0, DARK.card),
  "dark", "muted-foreground", "muted",
));
results.push(check(
  "Compliance NOT_APPLICABLE (dark)", DARK.mutedFg, compositeOver(DARK.muted, 0.50, DARK.card),
  "dark", "muted-foreground", "muted/50 over card",
));

// Review status dark
results.push(check(
  "Review PENDING (dark)", DARK.amber300, compositeOver(DARK.amber950, 0.30, DARK.card),
  "dark", "amber-300", "amber-950/30 over card",
));
results.push(check(
  "Review APPROVED (dark)", DARK.green300, compositeOver(DARK.green950, 0.30, DARK.card),
  "dark", "green-300", "green-950/30 over card",
));
results.push(check(
  "Review REJECTED (dark)", DARK.red300, compositeOver(DARK.red950, 0.30, DARK.card),
  "dark", "red-300", "red-950/30 over card",
));

// === Report ===
console.log("\n=== WCAG AA contrast check for status badges (target: 4.5:1) ===\n");
const failing: CheckResult[] = [];
for (const r of results) {
  const status = r.pass ? "PASS" : "FAIL";
  const ratioStr = r.ratio.toFixed(2).padStart(5);
  console.log(`  [${status}] ${r.mode.padEnd(5)} ${r.name.padEnd(34)} ${ratioStr}:1  fg=${r.fgLabel.padEnd(20)} bg=${r.bgLabel}`);
  if (!r.pass) failing.push(r);
}
console.log("");
if (failing.length === 0) {
  console.log(`All ${results.length} badge color combinations pass WCAG AA (>= 4.5:1).`);
} else {
  console.log(`${failing.length} of ${results.length} badge color combinations FAIL WCAG AA:`);
  for (const r of failing) {
    console.log(`  - ${r.mode} ${r.name}: ${r.ratio.toFixed(2)}:1  fg=${r.fgLabel} bg=${r.bgLabel}`);
  }
  process.exit(1);
}
