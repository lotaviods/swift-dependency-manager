/**
 * Property 6: Dependency label contains type-appropriate information
 *
 * For any LocalDependency, the tree item label should contain the text "Local"
 * and the dependency path. For any RemoteDependency, the tree item label should
 * contain a version requirement summary string.
 *
 * **Validates: Requirements 3.3, 3.4**
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type { Dependency, VersionRequirement, LocalDependency, RemoteDependency } from '../../models';
import { formatDependencyLabel, formatVersionRequirement } from '../../treeLabels';

// --- Generators ---

const arbVersion = fc.tuple(
  fc.nat({ max: 99 }),
  fc.nat({ max: 99 }),
  fc.nat({ max: 99 })
).map(([major, minor, patch]) => `${major}.${minor}.${patch}`);

const arbSafeString = fc.stringOf(
  fc.char().filter(c => c !== '"' && c !== '\\' && c !== '\0'),
  { minLength: 1, maxLength: 30 }
);

const arbBranchName = fc.stringOf(
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-_'.split('')),
  { minLength: 1, maxLength: 20 }
);

const arbRevisionHash = fc.stringOf(
  fc.constantFrom(...'0123456789abcdef'.split('')),
  { minLength: 7, maxLength: 40 }
);

const arbVersionRequirement: fc.Arbitrary<VersionRequirement> = fc.oneof(
  arbVersion.map(v => ({ type: 'upToNextMajor' as const, version: v })),
  arbVersion.map(v => ({ type: 'upToNextMinor' as const, version: v })),
  arbVersion.map(v => ({ type: 'from' as const, version: v })),
  arbVersion.map(v => ({ type: 'exact' as const, version: v })),
  arbBranchName.map(n => ({ type: 'branch' as const, name: n })),
  arbRevisionHash.map(h => ({ type: 'revision' as const, hash: h }))
);

const arbLocalDependency: fc.Arbitrary<LocalDependency> = arbSafeString.map(p => ({
  type: 'local' as const,
  path: `/tmp/${p}`,
  rawDeclaration: '',
  declarationRange: { start: 0, end: 0 },
}));

const arbRemoteDependency: fc.Arbitrary<RemoteDependency> = fc.tuple(
  arbSafeString,
  arbVersionRequirement
).map(([host, vr]) => ({
  type: 'remote' as const,
  url: `https://${host}.git`,
  versionRequirement: vr,
  rawDeclaration: '',
  declarationRange: { start: 0, end: 0 },
}));

// --- Property Tests ---

describe('Property 6: Dependency label contains type-appropriate information', () => {
  it('local dependency labels contain "Local" and the path', () => {
    fc.assert(
      fc.property(arbLocalDependency, (dep) => {
        const label = formatDependencyLabel(dep);

        expect(label).toContain('Local');
        expect(label).toContain(dep.path);
      }),
      { numRuns: 200 }
    );
  });

  it('remote dependency labels contain the version requirement summary', () => {
    fc.assert(
      fc.property(arbRemoteDependency, (dep) => {
        const label = formatDependencyLabel(dep);
        const vr = dep.versionRequirement;

        // Label should match the formatted version requirement
        const expectedSummary = formatVersionRequirement(vr);
        expect(label).toBe(expectedSummary);

        // Verify type-specific content is present
        switch (vr.type) {
          case 'upToNextMajor':
            expect(label).toContain('~>');
            expect(label).toContain(vr.version);
            expect(label).toContain('major');
            break;
          case 'upToNextMinor':
            expect(label).toContain('~>');
            expect(label).toContain(vr.version);
            expect(label).toContain('minor');
            break;
          case 'from':
            expect(label).toContain('from');
            expect(label).toContain(vr.version);
            break;
          case 'exact':
            expect(label).toContain('exact');
            expect(label).toContain(vr.version);
            break;
          case 'branch':
            expect(label).toContain('branch:');
            expect(label).toContain(vr.name);
            break;
          case 'revision':
            expect(label).toContain('rev:');
            expect(label).toContain(vr.hash);
            break;
        }
      }),
      { numRuns: 200 }
    );
  });

  it('formatVersionRequirement produces correct format for each type', () => {
    fc.assert(
      fc.property(arbVersionRequirement, (vr) => {
        const formatted = formatVersionRequirement(vr);

        // Should be a non-empty string
        expect(formatted.length).toBeGreaterThan(0);

        // Should contain the version/name/hash value
        switch (vr.type) {
          case 'upToNextMajor':
            expect(formatted).toBe(`~> ${vr.version} (major)`);
            break;
          case 'upToNextMinor':
            expect(formatted).toBe(`~> ${vr.version} (minor)`);
            break;
          case 'from':
            expect(formatted).toBe(`from ${vr.version}`);
            break;
          case 'exact':
            expect(formatted).toBe(`exact ${vr.version}`);
            break;
          case 'branch':
            expect(formatted).toBe(`branch: ${vr.name}`);
            break;
          case 'revision':
            expect(formatted).toBe(`rev: ${vr.hash}`);
            break;
        }
      }),
      { numRuns: 200 }
    );
  });
});
