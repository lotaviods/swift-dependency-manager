/**
 * Feature: bulk-dependency-update, Property 11: Bulk replacement set matches exactly the matching dependencies
 *
 * For any dependency name, new Dependency value, and list of SwiftPackages,
 * the set of replacement operations returned by computeReplacements should
 * correspond one-to-one with the set of dependencies across all packages
 * where getDependencyName(dep) equals the target name. Packages without a
 * matching dependency should have no replacement operations, and every
 * matching dependency should have exactly one replacement operation.
 *
 * **Validates: Requirements 9.1, 9.2, 9.4, 9.5**
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type { SwiftPackage, Dependency, LocalDependency, RemoteDependency, VersionRequirement } from '../../models';
import { computeReplacements } from '../../bulkUpdate';
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

const arbPackages = fc.array(arbSwiftPackage, { minLength: 1, maxLength: 6 });

// --- Property Tests ---

describe('Property 11: Bulk replacement set matches exactly the matching dependencies', () => {
  it('replacement oldDependency set equals the set of dependencies matching the target name', () => {
    fc.assert(
      fc.property(
        arbPackages.chain(packages => {
          // Collect all dependency names from the generated packages
          const allNames: string[] = [];
          for (const pkg of packages) {
            for (const dep of pkg.dependencies) {
              allNames.push(getDependencyName(dep));
            }
          }
          // Pick a target name from existing names (ensures at least some matches possible)
          const arbTargetName = allNames.length > 0
            ? fc.constantFrom(...allNames)
            : arbPathSegment;
          return fc.tuple(fc.constant(packages), arbTargetName, arbDependency);
        }),
        ([packages, targetName, newDep]) => {
          const result = computeReplacements(targetName, newDep, packages);

          // Collect all dependencies that should match
          const expectedMatches: Dependency[] = [];
          for (const pkg of packages) {
            for (const dep of pkg.dependencies) {
              if (getDependencyName(dep) === targetName) {
                expectedMatches.push(dep);
              }
            }
          }

          // The result set should have the same size as expected matches
          expect(result.length).toBe(expectedMatches.length);

          // Every oldDependency in the result should be one of the expected matches
          const resultOldDeps = result.map(r => r.oldDependency);
          for (const oldDep of resultOldDeps) {
            expect(expectedMatches).toContain(oldDep);
          }

          // Every expected match should appear as an oldDependency in the result
          for (const expected of expectedMatches) {
            expect(resultOldDeps).toContain(expected);
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it('packages without matching dependencies produce no replacement operations', () => {
    fc.assert(
      fc.property(
        arbPackages.chain(packages => {
          const allNames: string[] = [];
          for (const pkg of packages) {
            for (const dep of pkg.dependencies) {
              allNames.push(getDependencyName(dep));
            }
          }
          const arbTargetName = allNames.length > 0
            ? fc.constantFrom(...allNames)
            : arbPathSegment;
          return fc.tuple(fc.constant(packages), arbTargetName, arbDependency);
        }),
        ([packages, targetName, newDep]) => {
          const result = computeReplacements(targetName, newDep, packages);

          // For each package that has NO matching dependency, there should be
          // no replacement operations with that package's manifestPath
          for (const pkg of packages) {
            const hasMatch = pkg.dependencies.some(
              dep => getDependencyName(dep) === targetName
            );
            if (!hasMatch) {
              const opsForPkg = result.filter(r => r.filePath === pkg.manifestPath);
              expect(opsForPkg.length).toBe(0);
            }
          }
        }
      ),
      { numRuns: 200 }
    );
  });
});
