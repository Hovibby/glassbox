// Copyright (c) 2026 dotandev
// SPDX-License-Identifier: MIT OR Apache-2.0

/**
 * Tests for audit log canonical JSON serialization and schema validation.
 *
 * Acceptance criteria verified here:
 *  - Audit logs are serialized with deterministic canonical JSON ordering.
 *  - Payloads are validated against the strict schema before signing.
 *  - Multiple invocations produce byte-identical output for the same input.
 *  - Schema validation rejects invalid payloads with clear error messages.
 */

import stringify from 'fast-json-stable-stringify';
import { createHash } from 'crypto';
import { AuditLogger } from '../src/audit/AuditLogger';
import { MockAuditSigner } from '../src/audit/signing/mockSigner';
import {
  validateAuditPayload,
  assertValidAuditPayload,
  type AuditPayload,
} from '../src/audit/AuditPayloadSchema';
import type { ExecutionTrace } from '../src/audit/AuditLogger';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTrace(overrides: Partial<ExecutionTrace> = {}): ExecutionTrace {
  return {
    input: { amount: 100, currency: 'USD', user_id: 'u_123' },
    state: { balance_before: 500, balance_after: 400 },
    events: ['INIT_TRANSFER', 'DEBIT_ACCOUNT'],
    timestamp: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function hashOf(value: unknown): string {
  return createHash('sha256').update(stringify(value)).digest('hex');
}

// ─── Canonical serialization ──────────────────────────────────────────────────

describe('canonical JSON serialization', () => {
  test('fast-json-stable-stringify sorts keys lexicographically', () => {
    const a = stringify({ z: 1, a: 2, m: 3 });
    const b = stringify({ m: 3, z: 1, a: 2 });
    const c = stringify({ a: 2, m: 3, z: 1 });
    expect(a).toBe('{"a":2,"m":3,"z":1}');
    expect(a).toBe(b);
    expect(a).toBe(c);
  });

  test('nested objects have sorted keys at every level', () => {
    const result = stringify({
      outer_z: { inner_z: 1, inner_a: 2 },
      outer_a: 'x',
    });
    expect(result).toBe('{"outer_a":"x","outer_z":{"inner_a":2,"inner_z":1}}');
  });

  test('arrays preserve insertion order (not sorted)', () => {
    const result = stringify({ events: ['C', 'A', 'B'] });
    expect(result).toBe('{"events":["C","A","B"]}');
  });

  test('produces identical bytes across 100 invocations for the same input', () => {
    const trace = makeTrace();
    const first = stringify(trace);
    for (let i = 0; i < 100; i++) {
      expect(stringify(trace)).toBe(first);
    }
  });

  test('produces identical SHA-256 hashes across 100 invocations', () => {
    const trace = makeTrace();
    const first = hashOf(trace);
    for (let i = 0; i < 100; i++) {
      expect(hashOf(trace)).toBe(first);
    }
  });

  test('different key insertion order produces the same canonical string', () => {
    const v1: ExecutionTrace = {
      timestamp: '2026-01-01T00:00:00.000Z',
      input: { b: 2, a: 1 },
      state: { y: 9, x: 8 },
      events: ['E1'],
    };
    const v2: ExecutionTrace = {
      events: ['E1'],
      state: { x: 8, y: 9 },
      input: { a: 1, b: 2 },
      timestamp: '2026-01-01T00:00:00.000Z',
    };
    expect(stringify(v1)).toBe(stringify(v2));
    expect(hashOf(v1)).toBe(hashOf(v2));
  });

  test('different values produce different hashes', () => {
    const t1 = makeTrace({ input: { amount: 100 } });
    const t2 = makeTrace({ input: { amount: 101 } });
    expect(hashOf(t1)).not.toBe(hashOf(t2));
  });

  test('unicode strings are preserved byte-for-byte', () => {
    const trace = makeTrace({ input: { note: '日本語テスト 🔐' } });
    const s1 = stringify(trace);
    const s2 = stringify(trace);
    expect(s1).toBe(s2);
    expect(s1).toContain('日本語テスト');
  });

  test('empty collections serialize deterministically', () => {
    const trace = makeTrace({ input: {}, state: {}, events: [] });
    const s = stringify(trace);
    expect(s).toContain('"events":[]');
    expect(s).toContain('"input":{}');
    expect(s).toContain('"state":{}');
    expect(stringify(trace)).toBe(s);
  });
});

// ─── AuditLogger hash stability ───────────────────────────────────────────────

describe('AuditLogger hash stability', () => {
  test('two logs for the same trace produce the same hash', async () => {
    const trace = makeTrace();
    const signer = new MockAuditSigner();
    const logger = new AuditLogger(signer, 'mock');

    const log1 = await logger.generateLog(trace);
    const log2 = await logger.generateLog(trace);

    expect(log1.hash).toBe(log2.hash);
  });

  test('hash changes when input changes', async () => {
    const signer = new MockAuditSigner();
    const logger = new AuditLogger(signer, 'mock');

    const log1 = await logger.generateLog(makeTrace({ input: { amount: 100 } }));
    const log2 = await logger.generateLog(makeTrace({ input: { amount: 200 } }));

    expect(log1.hash).not.toBe(log2.hash);
  });

  test('hash changes when events change', async () => {
    const signer = new MockAuditSigner();
    const logger = new AuditLogger(signer, 'mock');

    const log1 = await logger.generateLog(makeTrace({ events: ['A'] }));
    const log2 = await logger.generateLog(makeTrace({ events: ['A', 'B'] }));

    expect(log1.hash).not.toBe(log2.hash);
  });

  test('hash is stable across 10 sequential invocations', async () => {
    const trace = makeTrace();
    const signer = new MockAuditSigner();
    const logger = new AuditLogger(signer, 'mock');

    const hashes = await Promise.all(
      Array.from({ length: 10 }, () => logger.generateLog(trace).then((l) => l.hash))
    );

    const unique = new Set(hashes);
    expect(unique.size).toBe(1);
  });

  test('multi-log hash is stable', async () => {
    const trace = makeTrace();
    const signerA = new MockAuditSigner();
    const signerB = new MockAuditSigner();
    const logger = new AuditLogger(signerA, 'mock');

    const signers = [
      { signer: signerA, provider: 'mock', label: 'alice' },
      { signer: signerB, provider: 'mock', label: 'bob' },
    ];

    const log1 = await logger.generateMultiLog(trace, signers);
    const log2 = await logger.generateMultiLog(trace, signers);

    expect(log1.hash).toBe(log2.hash);
  });
});

// ─── Schema validation ────────────────────────────────────────────────────────

describe('validateAuditPayload', () => {
  test('accepts a valid payload', () => {
    const result = validateAuditPayload(makeTrace());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('accepts a payload with optional metadata', () => {
    const result = validateAuditPayload({
      ...makeTrace(),
      metadata: { version: '1.0', env: 'testnet' },
    });
    expect(result.valid).toBe(true);
  });

  test('rejects null', () => {
    const result = validateAuditPayload(null);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/plain object/);
  });

  test('rejects an array', () => {
    const result = validateAuditPayload([]);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/plain object/);
  });

  test('rejects missing timestamp', () => {
    const { timestamp: _, ...rest } = makeTrace();
    const result = validateAuditPayload(rest);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('"timestamp"'))).toBe(true);
  });

  test('rejects missing input', () => {
    const { input: _, ...rest } = makeTrace();
    const result = validateAuditPayload(rest);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('"input"'))).toBe(true);
  });

  test('rejects missing state', () => {
    const { state: _, ...rest } = makeTrace();
    const result = validateAuditPayload(rest);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('"state"'))).toBe(true);
  });

  test('rejects missing events', () => {
    const { events: _, ...rest } = makeTrace();
    const result = validateAuditPayload(rest);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('"events"'))).toBe(true);
  });

  test('rejects invalid timestamp format', () => {
    const result = validateAuditPayload(makeTrace({ timestamp: 'not-a-date' } as any));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('ISO 8601'))).toBe(true);
  });

  test('rejects empty timestamp string', () => {
    const result = validateAuditPayload(makeTrace({ timestamp: '' } as any));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('"timestamp"'))).toBe(true);
  });

  test('rejects input as array', () => {
    const result = validateAuditPayload({ ...makeTrace(), input: [] });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('"input"'))).toBe(true);
  });

  test('rejects state as null', () => {
    const result = validateAuditPayload({ ...makeTrace(), state: null });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('"state"'))).toBe(true);
  });

  test('rejects events as object', () => {
    const result = validateAuditPayload({ ...makeTrace(), events: {} });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('"events"'))).toBe(true);
  });

  test('rejects metadata as array', () => {
    const result = validateAuditPayload({ ...makeTrace(), metadata: ['x'] });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('"metadata"'))).toBe(true);
  });

  test('rejects NaN in input', () => {
    const result = validateAuditPayload({ ...makeTrace(), input: { amount: NaN } });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('NaN'))).toBe(true);
  });

  test('rejects Infinity in state', () => {
    const result = validateAuditPayload({ ...makeTrace(), state: { balance: Infinity } });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Infinity'))).toBe(true);
  });

  test('rejects -Infinity in nested value', () => {
    const result = validateAuditPayload({
      ...makeTrace(),
      input: { nested: { deep: -Infinity } },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Infinity'))).toBe(true);
  });

  test('reports multiple errors at once', () => {
    const result = validateAuditPayload({ timestamp: 'bad', input: null, state: null });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(1);
  });
});

describe('assertValidAuditPayload', () => {
  test('does not throw for a valid payload', () => {
    expect(() => assertValidAuditPayload(makeTrace())).not.toThrow();
  });

  test('throws with all error messages for an invalid payload', () => {
    expect(() => assertValidAuditPayload({ timestamp: 'bad', input: null })).toThrow(
      /schema validation failed/
    );
  });
});

// ─── AuditLogger rejects invalid payloads ─────────────────────────────────────

describe('AuditLogger schema enforcement', () => {
  test('generateLog rejects a payload missing timestamp', async () => {
    const signer = new MockAuditSigner();
    const logger = new AuditLogger(signer, 'mock');
    const bad = { input: {}, state: {}, events: [] } as any;
    await expect(logger.generateLog(bad)).rejects.toThrow(/schema validation failed/);
  });

  test('generateLog rejects a payload with NaN in input', async () => {
    const signer = new MockAuditSigner();
    const logger = new AuditLogger(signer, 'mock');
    const bad = makeTrace({ input: { amount: NaN } });
    await expect(logger.generateLog(bad)).rejects.toThrow(/NaN/);
  });

  test('generateMultiLog rejects an invalid payload', async () => {
    const signer = new MockAuditSigner();
    const logger = new AuditLogger(signer, 'mock');
    const bad = { input: {}, state: {}, events: [] } as any;
    await expect(
      logger.generateMultiLog(bad, [{ signer, provider: 'mock' }])
    ).rejects.toThrow(/schema validation failed/);
  });

  test('generateLog accepts a valid payload and produces a verifiable log', async () => {
    const signer = new MockAuditSigner();
    const logger = new AuditLogger(signer, 'mock');
    const log = await logger.generateLog(makeTrace());
    expect(log.hash).toHaveLength(64); // SHA-256 hex
    expect(log.signature).toBeTruthy();
  });
});
