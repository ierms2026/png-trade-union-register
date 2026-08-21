// =============================================================================
// Form validation utilities — pure functions for client-side validation.
//
// WHY PURE FUNCTIONS (not a schema library like zod):
//   - The login form + a few dialogs are the only places that need
//     client-side validation. Pulling in zod + a resolver for this would
//     be over-engineering.
//   - Pure functions are tree-shakeable, testable, and have zero runtime
//     dependencies.
//   - Each validator returns `string | null` — the error message, or null
//     if valid. This shape works directly with our FieldError component.
//
// THE `isValid` HELPER:
//   Combines multiple validators into a single boolean for the submit
//   handler. Usage:
//     const errors = { email: validateEmail(email), password: validateRequired(password, "Password") };
//     if (!isValid(errors)) return; // don't submit
// =============================================================================

/** A validation result: an error message string, or null if valid. */
export type ValidationResult = string | null;

/** A record of field name → validation result. Used by isValid. */
export type ValidationErrors = Record<string, ValidationResult>;

/**
 * Validate an email address.
 *
 * We use a pragmatic regex (not RFC 5322 — that's overkill for client-side
 * validation and would reject valid edge cases). The regex checks:
 *   - Non-empty local part
 *   - @ symbol
 *   - Non-empty domain with at least one dot
 *
 * The real validation happens server-side (the DB unique constraint catches
 * duplicates; the set-password flow fails loudly if the email is undeliverable).
 */
export function validateEmail(email: string): ValidationResult {
  if (!email || email.trim().length === 0) {
    return "Email is required.";
  }
  const trimmed = email.trim();
  // Pragmatic email regex — good enough for client-side feedback.
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed)) {
    return "Please enter a valid email address.";
  }
  return null;
}

/**
 * Validate that a required field is non-empty.
 *
 * @param value    The value to check.
 * @param fieldName  The human-readable field name for the error message.
 */
export function validateRequired(
  value: string,
  fieldName: string,
): ValidationResult {
  if (!value || value.trim().length === 0) {
    return `${fieldName} is required.`;
  }
  return null;
}

/**
 * Validate that a value is a positive integer.
 *
 * @param value    The value to check (string or number).
 * @param fieldName  The human-readable field name for the error message.
 */
export function validateInteger(
  value: string | number,
  fieldName: string,
): ValidationResult {
  if (value === "" || value === null || value === undefined) {
    return `${fieldName} is required.`;
  }
  const num = typeof value === "number" ? value : parseInt(value, 10);
  if (isNaN(num) || !Number.isInteger(num)) {
    return `${fieldName} must be a whole number.`;
  }
  if (num < 0) {
    return `${fieldName} must be 0 or greater.`;
  }
  return null;
}

/**
 * Validate that a value is a valid ISO date string.
 */
export function validateDate(
  value: string,
  fieldName: string,
): ValidationResult {
  if (!value || value.trim().length === 0) {
    return `${fieldName} is required.`;
  }
  const d = new Date(value);
  if (isNaN(d.getTime())) {
    return `${fieldName} must be a valid date.`;
  }
  return null;
}

/**
 * Validate a 6-digit TOTP code.
 *
 * @param code  The code the user entered.
 */
export function validateTotpCode(code: string): ValidationResult {
  if (!code || code.trim().length === 0) {
    return "Code is required.";
  }
  const trimmed = code.trim();
  if (!/^\d{6}$/.test(trimmed)) {
    return "Code must be exactly 6 digits.";
  }
  return null;
}

/**
 * Validate that a scopes array is non-empty and contains only allowed scopes.
 *
 * @param scopes       The array of scope strings.
 * @param allowed      The set of allowed scope strings.
 */
export function validateScopes(
  scopes: string[],
  allowed: Set<string>,
): ValidationResult {
  if (!Array.isArray(scopes) || scopes.length === 0) {
    return "At least one scope is required.";
  }
  for (const s of scopes) {
    if (!allowed.has(s)) {
      return `Invalid scope: ${s}`;
    }
  }
  return null;
}

/**
 * Validate a File object for upload.
 *
 * @param file        The File to validate.
 * @param maxSize     Max size in bytes.
 * @param allowedExts  Optional array of allowed extensions (e.g., [".pdf"]).
 */
export function validateFile(
  file: File | null | undefined,
  fieldName: string,
  maxSize: number,
  allowedExts?: string[],
): ValidationResult {
  if (!file) {
    return `${fieldName} is required.`;
  }
  if (file.size === 0) {
    return `${fieldName} is empty.`;
  }
  if (file.size > maxSize) {
    const mb = Math.round(maxSize / (1024 * 1024));
    return `${fieldName} is too large. Maximum size is ${mb} MB.`;
  }
  if (allowedExts && allowedExts.length > 0) {
    // Extract extension from file.name (case-insensitive).
    const dotIndex = file.name.lastIndexOf(".");
    if (dotIndex < 0) {
      return `${fieldName} must have one of these extensions: ${allowedExts.join(", ")}`;
    }
    const ext = file.name.slice(dotIndex).toLowerCase();
    if (!allowedExts.includes(ext)) {
      return `${fieldName} must be one of: ${allowedExts.join(", ")}`;
    }
  }
  return null;
}

/**
 * Check if a ValidationErrors record has any non-null values (i.e., any
 * field has an error).
 *
 * @returns true if ALL fields are valid (no errors), false otherwise.
 */
export function isValid(errors: ValidationErrors): boolean {
  return Object.values(errors).every((v) => v === null);
}
