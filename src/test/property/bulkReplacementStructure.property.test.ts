/**
 * Feature: bulk-dependency-update, Property 12: Replacement operations contain correct file paths and dependency references
 *
 * For any dependency name, new Dependency value, and list of SwiftPackages,
 * each replacement operation returned by computeReplacements should have:
 * (a) a filePath equal to the manifestPath of the package containing the
 * matched dependency, (b) an oldDependency that is reference-equal to the
 * original dependency object from that package, and (c) a newDependency
 * that is the provided new Dependency value.
 *
 * **Validates: Requirements 9.3**
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type { SwiftPackage, Dependency, LocalDependency, RemoteDependency, VersionRequirement } from '../../models';
import { computeReplacements } from '../../bulkUpdate';
import { getDependencyName } from '../../treeLabels';

// --- Generators (reused from bulkReplacementSet.property.test.ts) ---

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

describe('Property 12: Replacement operations contain correct file paths and dependency references', () => {
  it('each operation filePath matches the source package manifestPath, oldDependency is reference-equal to the original, and newDependency is the provided value', () => {
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

          // Build a map from each matching dependency to its package for lookup
          const depToPackage = new Map<Dependency, SwiftPackage>();
          for (const pkg of packages) {
            for (const dep of pkg.dependencies) {
              if (getDependencyName(dep) === targetName) {
                depToPackage.set(dep, pkg);
              }
            }
          }

          for (const op of result) {
            // (a) filePath equals the manifestPath of the package containing the matched dependency
            const sourcePkg = depToPackage.get(op.oldDependency);
            expect(sourcePkg).toBeDefined();
            expect(op.filePath).toBe(sourcePkg!.manifestPath);

            // (b) oldDependency is reference-equal to the original dependency object
            expect(depToPackage.has(op.oldDependency)).toBe(true);

            // (c) newDependency is the provided new Dependency value
            expect(op.newDependency).toBe(newDep);
          }
        }
      ),
      { numRuns: 200 }
    );
  });
});
