/**
 * Property 1: Dependency round-trip (parse → serialize → parse)
 *
 * For any valid Dependency object (local or remote, with any supported
 * VersionRequirement type), serializing it into a `.package(...)` declaration
 * string and then parsing that string back should produce a Dependency object
 * equivalent to the original.
 *
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.7, 2.8**
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { parseDependencyDeclaration } from '../../parser';
import { serializeDependency } from '../../serializer';
import type { Dependency, VersionRequirement } from '../../models';

// --- Generators ---

/** Generate a non-empty string without double-quotes or backslashes (valid inside Swift string literals). */
const arbSafeString = fc.stringOf(
  fc.char().filter(c => c !== '"' && c !== '\\' && c !== '\0'),
  { minLength: 1, maxLength: 50 }
);

/** Generate a semver-like version string. */
const arbVersion = fc.tuple(
  fc.nat({ max: 99 }),
  fc.nat({ max: 99 }),
  fc.nat({ max: 99 })
).map(([major, minor, patch]) => `${major}.${minor}.${patch}`);

/** Generate a valid filesystem path. */
const arbPath = fc.tuple(
  fc.constantFrom('/Users', '/home', '/opt', '/tmp'),
  arbSafeString
).map(([prefix, rest]) => `${prefix}/${rest}`);

/** Generate a valid URL string. */
const arbUrl = fc.tuple(
  fc.constantFrom('https://', 'http://'),
  arbSafeString,
  fc.constantFrom('.git', '')
).map(([proto, host, suffix]) => `${proto}${host}${suffix}`);

/** Generate a branch name (alphanumeric + hyphens). */
const arbBranchName = fc.stringOf(
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-_'.split('')),
  { minLength: 1, maxLength: 30 }
);

/** Generate a revision hash (hex string). */
const arbRevisionHash = fc.stringOf(
  fc.constantFrom(...'0123456789abcdef'.split('')),
  { minLength: 7, maxLength: 40 }
);

/** Generate any VersionRequirement variant. */
const arbVersionRequirement: fc.Arbitrary<VersionRequirement> = fc.oneof(
  arbVersion.map(v => ({ type: 'upToNextMajor' as const, version: v })),
  arbVersion.map(v => ({ type: 'upToNextMinor' as const, version: v })),
  arbVersion.map(v => ({ type: 'from' as const, version: v })),
  arbVersion.map(v => ({ type: 'exact' as const, version: v })),
  arbBranchName.map(n => ({ type: 'branch' as const, name: n })),
  arbRevisionHash.map(h => ({ type: 'revision' as const, hash: h }))
);

/** Generate a LocalDependency. */
const arbLocalDependency = arbPath.map(p => ({
  type: 'local' as const,
  path: p,
  rawDeclaration: '',
  declarationRange: { start: 0, end: 0 },
}));

/** Generate a RemoteDependency. */
const arbRemoteDependency = fc.tuple(arbUrl, arbVersionRequirement).map(([url, vr]) => ({
  type: 'remote' as const,
  url,
  versionRequirement: vr,
  rawDeclaration: '',
  declarationRange: { start: 0, end: 0 },
}));

/** Generate any Dependency. */
const arbDependency: fc.Arbitrary<Dependency> = fc.oneof(
  arbLocalDependency,
  arbRemoteDependency
);

// --- Property Test ---

describe('Property 1: Dependency round-trip (parse → serialize → parse)', () => {
  it('serializing then parsing produces an equivalent dependency', () => {
    fc.assert(
      fc.property(arbDependency, (dep) => {
        const serialized = serializeDependency(dep);
        const parsed = parseDependencyDeclaration(serialized);

        expect(parsed).not.toBeNull();

        if (dep.type === 'local') {
          expect(parsed!.type).toBe('local');
          if (parsed!.type === 'local') {
            expect(parsed!.path).toBe(dep.path);
          }
        } else {
          expect(parsed!.type).toBe('remote');
          if (parsed!.type === 'remote') {
            expect(parsed!.url).toBe(dep.url);
            expect(parsed!.versionRequirement).toEqual(dep.versionRequirement);
          }
        }
      }),
      { numRuns: 200 }
    );
  });
});
