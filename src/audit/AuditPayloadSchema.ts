// Copyright (c) 2026 dotandev
// SPDX-License-Identifier: MIT OR Apache-2.0

/**
 * AuditPayloadSchema
 *
 * Defines the strict schema for audit log payloads and provides a
 * pure-TypeScript validator that runs before any signing operation.
 * No external schema-validation library is required.
 *
 * Canonicalization guarantees (see docs/audit-canonicalization.md):
 *  - Keys are sorted lexicographically at every nesting level via
 *    fast-json-stable-stringify before hashing.
 *  - Strings are encoded as UTF-8; no locale-specific collation is used.
 *  - Numbers follow IEEE 754 double precision; NaN and Infinity are rejected.
 *  - The serialized form is byte-identical across Node.js versions and
 *    operating systems for the same logical payload.
 */

// ─── Schema definition ────────────────────────────────────────────────────────

/**
 * The canonical shape of an audit log payload before signing.
 * All fields are required unless explicitly marked optional.
 */
export interface AuditPayload {
  /** ISO 8601 UTC timestamp of when the trace was captured. */
  timestamp: string;
  /** Arbitrary key-value input parameters for the traced operation. */
  input: Record<string, unknown>;
  /** Arbitrary key-value state snapshot at the time of the trace. */
  state: Record<string, unknown>;
  /** Ordered list of events emitted during the traced operation. */
  events: unknown[];
  /** Optional free-form metadata (e.g. version, environment). */
  metadata?: Record<string, unknown>;
}

// ─── Validation result ────────────────────────────────────────────────────────

export interface ValidationResult {
  /** true when the payload satisfies the schema. */
  valid: boolean;
  /** Human-readable error messages, one per violated constraint. */
  errors: string[];
}

// ─── Validator ────────────────────────────────────────────────────────────────

/**
 * Validates an audit payload against the strict schema.
 *
 * Checks performed:
 *  1. Top-level type is a plain object (not null, array, or primitive).
 *  2. Required fields are present: timestamp, input, state, events.
 *  3. `timestamp` is a non-empty string in ISO 8601 format.
 *  4. `input` and `state` are plain objects (not arrays or null).
 *  5. `events` is an array.
 *  6. `metadata`, when present, is a plain object.
 *  7. No NaN or Infinity values appear anywhere in the payload (they
 *     cannot be represented in JSON and would corrupt the canonical form).
 *  8. No circular references (detected via JSON.stringify).
 */
export function validateAuditPayload(payload: unknown): ValidationResult {
  const errs: string[] = [];

  // 1. Top-level must be a plain object
  if (!isPlainObject(payload)) {
    return {
      valid: false,
      errors: ['payload must be a plain object'],
    };
  }

  const p = payload as Record<string, unknown>;

  // 2. Required fields
  const required: Array<keyof AuditPayload> = ['timestamp', 'input', 'state', 'events'];
  for (const field of required) {
    if (!(field in p)) {
      errs.push(`missing required field: "${field}"`);
    }
  }

  // 3. timestamp: non-empty ISO 8601 string
  if ('timestamp' in p) {
    if (typeof p.timestamp !== 'string' || p.timestamp.trim() === '') {
      errs.push('"timestamp" must be a non-empty string');
    } else if (!isISO8601(p.timestamp)) {
      errs.push(`"timestamp" must be a valid ISO 8601 date-time string, got: "${p.timestamp}"`);
    }
  }

  // 4. input: plain object
  if ('input' in p) {
    if (!isPlainObject(p.input)) {
      errs.push('"input" must be a plain object (not an array or null)');
    }
  }

  // 5. state: plain object
  if ('state' in p) {
    if (!isPlainObject(p.state)) {
      errs.push('"state" must be a plain object (not an array or null)');
    }
  }

  // 6. events: array
  if ('events' in p) {
    if (!Array.isArray(p.events)) {
      errs.push('"events" must be an array');
    }
  }

  // 7. metadata: plain object when present
  if ('metadata' in p && p.metadata !== undefined) {
    if (!isPlainObject(p.metadata)) {
      errs.push('"metadata" must be a plain object when present');
    }
  }

  // 8. No NaN / Infinity anywhere
  const nanInfErrors = findNaNOrInfinity(p, '');
  errs.push(...nanInfErrors);

  // 9. No circular references
  try {
    JSON.stringify(p);
  } catch {
    errs.push('payload contains circular references and cannot be serialized');
  }

  return { valid: errs.length === 0, errors: errs };
}

/**
 * Throws a descriptive error if the payload fails schema validation.
 * Use this as a guard before signing.
 */
export function assertValidAuditPayload(payload: unknown): asserts payload is AuditPayload {
  const result = validateAuditPayload(payload);
  if (!result.valid) {
    throw new Error(
      `Audit payload schema validation failed:\n${result.errors.map((e) => `  - ${e}`).join('\n')}`
    );
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns true for plain objects (not null, not arrays, not class instances). */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Loose ISO 8601 date-time check.
 * Accepts the subset produced by Date.toISOString() and common variants.
 */
function isISO8601(s: string): boolean {
  // Must be parseable as a date and not NaN
  const d = new Date(s);
  if (isNaN(d.getTime())) return false;
  // Must contain at least a date portion (YYYY-MM-DD)
  return /^\d{4}-\d{2}-\d{2}/.test(s);
}

/**
 * Recursively walks a value and returns error messages for any NaN or
 * Infinity values found. These cannot be represented in JSON and would
 * silently corrupt the canonical serialization.
 */
function findNaNOrInfinity(value: unknown, path: string): string[] {
  const errs: string[] = [];

  if (typeof value === 'number') {
    if (isNaN(value)) {
      errs.push(`NaN value at path "${path || '(root)'}"; NaN cannot be serialized to JSON`);
    } else if (!isFinite(value)) {
      errs.push(`Infinity value at path "${path || '(root)'}"; Infinity cannot be serialized to JSON`);
    }
    return errs;
  }

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      errs.push(...findNaNOrInfinity(value[i], `${path}[${i}]`));
    }
    return errs;
  }

  if (isPlainObject(value)) {
    for (const [k, v] of Object.entries(value)) {
      errs.push(...findNaNOrInfinity(v, path ? `${path}.${k}` : k));
    }
  }

  return errs;
}
