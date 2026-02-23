/**
 * Property 9: Dependency grouping is complete
 *
 * For any set of SwiftPackages with dependencies, the grouping function should
 * produce groups where: (a) every dependency appears in exactly one group keyed
 * by its dependency name, and (b) the total count of entries across all groups
 * equals the total count of dependencies across all packages.
 *
 * **Validates: Requirements 7.2**
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type { SwiftPackage, Dependency, LocalDependency, RemoteDependency, VersionRequirement } from '../../models';
import { groupDependenciesByName } from '../../grouping';
import { getDependencyName } from '../../treeLabels';

// --- Generators ---

const arbVersion = fc.tuple(
  fc.nat({ max: 99 }),
  fc.nat({ max: 99 }),
  fc.nat({ max: 99 })
).map(([major, minor, patch]) => `${major}.${minor}.${patch}`);

const arbPathSegment = fc.stringOf(
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')),
  { minLength: 1, maxLength: 15 }
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

const arbLocalDependency: fc.Arbitrary<LocalDependency> = arbPathSegment.map(name => ({
  type: 'local' as const,
  path: `/tmp/${name}`,
  rawDeclaration: '',
  declarationRange: { start: 0, end: 0 },
}));

const arbRemoteDependency: fc.Arbitrary<RemoteDependency> = fc.tuple(
  arbPathSegment,
  arbVersionRequirement
).map(([name, vr]) => ({
  type: 'remote' as const,
  url: `https://github.com/org/${name}.git`,
  versionRequirement: vr,
  rawDeclaration: '',
  declarationRange: { start: 0, end: 0 },
}));

const arbDependency: fc.Arbitrary<Dependency> = fc.oneof(
  arbLocalDependency,
  arbRemoteDependency
);

const arbSwiftPackage: fc.Arbitrary<SwiftPackage> = fc.tuple(
  arbPathSegment,
  fc.array(arbDependency, { minLength: 0, maxLength: 8 })
).map(([name, deps]) => ({
  name,
  path: `/workspace/${name}`,
  manifestPath: `/workspace/${name}/Package.swift`,
  dependencies: deps,
}));

const arbPackages = fc.array(arbSwiftPackage, { minLength: 0, maxLength: 6 });

// --- Property Tests ---

describe('Property 9: Dependency grouping is complete', () => {
  it('total entries across all groups equals total dependencies across all packages', () => {
    fc.assert(
      fc.property(arbPackages, (packages) => {
        const groups = groupDependenciesByName(packages);

        const totalDeps = packages.reduce((sum, pkg) => sum + pkg.dependencies.length, 0);
        const totalEntries = groups.reduce((sum, g) => sum + g.entries.length, 0);

        expect(totalEntries).toBe(totalDeps);
      }),
      { numRuns: 200 }
    );
  });

  it('every dependency appears in exactly one group keyed by its name', () => {
    fc.assert(
      fc.property(arbPackages, (packages) => {
        const groups = groupDependenciesByName(packages);

        // Track entries by object reference to handle duplicate identical deps in the same package
        const seen = new Set<Dependency>();

        for (const group of groups) {
          for (const entry of group.entries) {
            const depName = getDependencyName(entry.dependency);
            // Group name should match the dependency name
            expect(group.name).toBe(depName);

            // Track that we saw this entry (by reference identity)
            expect(seen.has(entry.dependency)).toBe(false);
            seen.add(entry.dependency);
          }
        }
      }),
      { numRuns: 200 }
    );
  });

  it('every dependency from every package is present in some group', () => {
    fc.assert(
      fc.property(arbPackages, (packages) => {
        const groups = groupDependenciesByName(packages);

        // Collect all entries from groups
        const allEntries: Array<{ packageName: string; dependency: Dependency }> = [];
        for (const group of groups) {
          allEntries.push(...group.entries);
        }

        // For each package dependency, verify it appears in the entries
        for (const pkg of packages) {
          for (const dep of pkg.dependencies) {
            const found = allEntries.some(
              e => e.packageName === pkg.name && e.dependency === dep
            );
            expect(found).toBe(true);
          }
        }
      }),
      { numRuns: 200 }
    );
  });
});
