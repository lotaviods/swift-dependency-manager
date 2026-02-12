/**
 * Property 8: Whitespace-only input rejected by validator
 *
 * For any string composed entirely of whitespace characters (spaces, tabs,
 * newlines) or the empty string, the input validator should reject it and
 * return a validation error.
 *
 * **Validates: Requirements 5.3, 6.3**
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { validateNonEmpty } from '../../validator';

// --- Generators ---

/** Generate a string composed entirely of whitespace characters. */
const arbWhitespaceOnly = fc.stringOf(
  fc.constantFrom(' ', '\t', '\n', '\r', '\f', '\v'),
  { minLength: 0, maxLength: 100 }
);

/** Generate a string that contains at least one non-whitespace character. */
const arbNonEmpty = fc
  .tuple(
    fc.string({ minLength: 0, maxLength: 20 }),
    fc.char().filter(c => c.trim().length > 0),
    fc.string({ minLength: 0, maxLength: 20 })
  )
  .map(([prefix, nonWs, suffix]) => `${prefix}${nonWs}${suffix}`);

// --- Property Tests ---

describe('Property 8: Whitespace-only input rejected by validator', () => {
  it('rejects empty and whitespace-only strings', () => {
    fc.assert(
      fc.property(arbWhitespaceOnly, (input) => {
        const result = validateNonEmpty(input);
        expect(result).not.toBeNull();
        expect(typeof result).toBe('string');
      }),
      { numRuns: 200 }
    );
  });

  it('accepts strings with at least one non-whitespace character', () => {
    fc.assert(
      fc.property(arbNonEmpty, (input) => {
        const result = validateNonEmpty(input);
        expect(result).toBeNull();
      }),
      { numRuns: 200 }
    );
  });
});
