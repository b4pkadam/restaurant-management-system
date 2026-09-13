/**
 * Security and Authentication Validation Utility
 * Enforces strict length limits, input sanitization, and pattern matching
 * to prevent injection attacks (SQL/NoSQL/XSS/Command), buffer overruns,
 * and bcrypt denial-of-service vulnerabilities.
 */

export interface ValidationResult {
  isValid: boolean;
  error?: string;
  cleanValue: string;
}

// Minimum and maximum boundaries for credentials
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;
export const PASSWORD_MIN_LENGTH = 3;
export const PASSWORD_MAX_LENGTH = 72; // Bcrypt 72-byte max limit to prevent DoS

// Whitelist: letters, digits, underscore, dot, hyphen, at-sign.
// Must start with an alphanumeric or underscore, length 3 to 30.
const USERNAME_SAFE_REGEX = /^[a-zA-Z0-9_][a-zA-Z0-9_.@-]{2,29}$/;

// Common injection patterns and dangerous character sequences
const DANGEROUS_PAYLOAD_REGEX = /<[^>]*>|javascript:|data:|vbscript:|on\w+\s*=|[$][{]|[;`\\'"|&*?!#%^~=+[\]{}()<>]/i;

/**
 * Validates and sanitizes username inputs against injection and overflow attacks.
 */
export function validateUsername(username: unknown): ValidationResult {
  if (typeof username !== 'string') {
    return { isValid: false, error: 'Username must be a valid text string.', cleanValue: '' };
  }

  const clean = username.trim();

  if (!clean) {
    return { isValid: false, error: 'Username cannot be empty.', cleanValue: '' };
  }

  if (clean.length < USERNAME_MIN_LENGTH) {
    return {
      isValid: false,
      error: `Username must be at least ${USERNAME_MIN_LENGTH} characters long.`,
      cleanValue: clean,
    };
  }

  if (clean.length > USERNAME_MAX_LENGTH) {
    return {
      isValid: false,
      error: `Username cannot exceed ${USERNAME_MAX_LENGTH} characters.`,
      cleanValue: clean.slice(0, USERNAME_MAX_LENGTH),
    };
  }

  // Reject non-printable control characters
  if (/[\x00-\x1F\x7F]/.test(clean)) {
    return { isValid: false, error: 'Username contains forbidden control characters.', cleanValue: '' };
  }

  // Reject dangerous injection strings/symbols
  if (DANGEROUS_PAYLOAD_REGEX.test(clean)) {
    return {
      isValid: false,
      error: 'Username contains invalid or dangerous characters. Only letters, numbers, underscores, dots, and hyphens are permitted.',
      cleanValue: clean,
    };
  }

  // Enforce safe whitelist regex
  if (!USERNAME_SAFE_REGEX.test(clean)) {
    return {
      isValid: false,
      error: `Username must be ${USERNAME_MIN_LENGTH}-${USERNAME_MAX_LENGTH} characters and begin with a letter or number.`,
      cleanValue: clean,
    };
  }

  return { isValid: true, cleanValue: clean };
}

/**
 * Validates password input:
 * - Prevents empty / whitespace passwords
 * - Limits max length to 72 chars (Bcrypt safety & DoS prevention)
 * - Minimum 3 characters
 * - Strips/rejects null bytes and control characters
 */
export function validatePassword(password: unknown): ValidationResult {
  if (typeof password !== 'string') {
    return { isValid: false, error: 'Password must be a valid text string.', cleanValue: '' };
  }

  const clean = password.trim();

  if (!clean) {
    return { isValid: false, error: 'Password cannot be empty or only whitespace.', cleanValue: '' };
  }

  if (clean.length < PASSWORD_MIN_LENGTH) {
    return {
      isValid: false,
      error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters long.`,
      cleanValue: clean,
    };
  }

  if (clean.length > PASSWORD_MAX_LENGTH) {
    return {
      isValid: false,
      error: `Password cannot exceed ${PASSWORD_MAX_LENGTH} characters (security limit).`,
      cleanValue: clean.slice(0, PASSWORD_MAX_LENGTH),
    };
  }

  // Disallow null bytes and non-printable control characters
  if (/[\x00-\x1F\x7F]/.test(clean)) {
    return { isValid: false, error: 'Password contains invalid non-printable characters.', cleanValue: '' };
  }

  return { isValid: true, cleanValue: clean };
}

/**
 * Escapes HTML entities to prevent Cross-Site Scripting (XSS) (CWE-79).
 */
export function escapeHtml(str: unknown): string {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"'/]/g, (m) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
    '/': '&#x2F;',
  }[m]!));
}

/**
 * Validates and sanitizes URLs (e.g. logos or external links) to prevent javascript: pseudo-protocol XSS.
 */
export function sanitizeUrl(url: unknown): string {
  if (typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  // Only permit safe protocols: http, https, or data:image
  if (/^(https?:\/\/|data:image\/)/i.test(trimmed)) {
    return escapeHtml(trimmed);
  }
  return '';
}
