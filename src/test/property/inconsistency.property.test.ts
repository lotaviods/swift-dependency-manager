/**
 * Property 10: Inconsistency detection flags differing versions
 *
 * For any group of two or more dependencies with the same name but different
 * VersionRequirements or different source types (local vs remote), the
 * inconsistency detector should flag that group as inconsistent.
 *
 * **Validates: Requirements 7.3**
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type { SwiftPackage, LocalDependency, RemoteDependency, VersionRequirement } from '../../models';
import { groupDependenciesByName } from '../../grouping';

// --- Generators ---

const arbVersion = fc.tuple(
  fc.nat({ max: 99 }),
  fc.nat({ max: 99 }),
  fc.nat({ max: 99 })
).map(([major, minor, patch]) => `${major}.${minor}.${patch}`);

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

const arbDepName = fc.stringOf(
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')),
  { minLength: 1, maxLength: 12 }
);

const arbPackageName = fc.stringOf(
  fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')),
  { minLength: 1, maxLength: 10 }
);

function makeLocalDep(name: string): LocalDependency {
  return {
    type: 'local',
    path: `/tmp/${name}`,
    rawDeclaration: '',
    declarationRange: { start: 0, end: 0 },
  };
}

function makeRemoteDep(name: string, vr: VersionRequirement): RemoteDependency {
  return {
    type: 'remote',
    url: `https://github.com/org/${name}.git`,
    versionRequirement: vr,
    rawDeclaration: '',
    declarationRange: { start: 0, end: 0 },
  };
}

// --- Property Tests ---

describe('Property 10: Inconsistency detection flags differing versions', () => {
  it('mixed source types (local + remote) for same name are flagged inconsistent', () => {
    fc.assert(
      fc.property(
        arbDepName,
        arbPackageName,
        arbPackageName.filter(n => n.length > 0),
        arbVersionRequirement,
        (depName, pkg1Name, pkg2Name, vr) => {
          // Ensure different package names
          const actualPkg2 = pkg2Name === pkg1Name ? pkg2Name + 'X' : pkg2Name;

          const packages: SwiftPackage[] = [
            {
              name: pkg1Name,
              path: `/ws/${pkg1Name}`,
              manifestPath: `/ws/${pkg1Name}/Package.swift`,
              dependencies: [makeLocalDep(depName)],
            },
            {
              name: actualPkg2,
              path: `/ws/${actualPkg2}`,
              manifestPath: `/ws/${actualPkg2}/Package.swift`,
              dependencies: [makeRemoteDep(depName, vr)],
            },
          ];

          const groups = groupDependenciesByName(packages);
          const group = groups.find(g => g.name === depName);

          expect(group).toBeDefined();
          expect(group!.isInconsistent).toBe(true);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('different version requirements for same remote dep are flagged inconsistent', () => {
    fc.assert(
      fc.property(
        arbDepName,
        arbPackageName,
        arbPackageName.filter(n => n.length > 0),
        arbVersionRequirement,
        arbVersionRequirement,
        (depName, pkg1Name, pkg2Name, vr1, vr2) => {
          // Only test when version requirements are actually different
          const label1 = vrLabel(vr1);
          const label2 = vrLabel(vr2);
          fc.pre(label1 !== label2);

          const actualPkg2 = pkg2Name === pkg1Name ? pkg2Name + 'X' : pkg2Name;

          const packages: SwiftPackage[] = [
            {
              name: pkg1Name,
              path: `/ws/${pkg1Name}`,
              manifestPath: `/ws/${pkg1Name}/Package.swift`,
              dependencies: [makeRemoteDep(depName, vr1)],
            },
            {
              name: actualPkg2,
              path: `/ws/${actualPkg2}`,
              manifestPath: `/ws/${actualPkg2}/Package.swift`,
              dependencies: [makeRemoteDep(depName, vr2)],
            },
          ];

          const groups = groupDependenciesByName(packages);
          const group = groups.find(g => g.name === depName);

          expect(group).toBeDefined();
          expect(group!.isInconsistent).toBe(true);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('identical dependencies across packages are NOT flagged inconsistent', () => {
    fc.assert(
      fc.property(
        arbDepName,
        arbPackageName,
        arbPackageName.filter(n => n.length > 0),
        arbVersionRequirement,
        (depName, pkg1Name, pkg2Name, vr) => {
          const actualPkg2 = pkg2Name === pkg1Name ? pkg2Name + 'X' : pkg2Name;

          const packages: SwiftPackage[] = [
            {
              name: pkg1Name,
              path: `/ws/${pkg1Name}`,
              manifestPath: `/ws/${pkg1Name}/Package.swift`,
              dependencies: [makeRemoteDep(depName, vr)],
            },
            {
              name: actualPkg2,
              path: `/ws/${actualPkg2}`,
              manifestPath: `/ws/${actualPkg2}/Package.swift`,
              dependencies: [makeRemoteDep(depName, vr)],
            },
          ];

          const groups = groupDependenciesByName(packages);
          const group = groups.find(g => g.name === depName);

          expect(group).toBeDefined();
          expect(group!.isInconsistent).toBe(false);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('single dependency in a group is never inconsistent', () => {
    fc.assert(
      fc.property(
        arbDepName,
        arbPackageName,
        arbVersionRequirement,
        (depName, pkgName, vr) => {
          const packages: SwiftPackage[] = [
            {
              name: pkgName,
              path: `/ws/${pkgName}`,
              manifestPath: `/ws/${pkgName}/Package.swift`,
              dependencies: [makeRemoteDep(depName, vr)],
            },
          ];

          const groups = groupDependenciesByName(packages);
          const group = groups.find(g => g.name === depName);

          expect(group).toBeDefined();
          expect(group!.isInconsistent).toBe(false);
        }
      ),
      { numRuns: 200 }
    );
  });
});

/** Helper to produce a comparable label for a version requirement */
function vrLabel(vr: VersionRequirement): string {
  switch (vr.type) {
    case 'upToNextMajor': return `upToNextMajor:${vr.version}`;
    case 'upToNextMinor': return `upToNextMinor:${vr.version}`;
    case 'from': return `from:${vr.version}`;
    case 'exact': return `exact:${vr.version}`;
    case 'branch': return `branch:${vr.name}`;
    case 'revision': return `revision:${vr.hash}`;
  }
}
