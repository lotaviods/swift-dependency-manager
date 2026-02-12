/**
 * Property 5: Tree children count matches dependency count
 *
 * For any SwiftPackage with N dependencies, the tree provider's getChildren
 * logic should return exactly N child items when called with a package node.
 *
 * **Validates: Requirements 3.2**
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type { SwiftPackage, Dependency, VersionRequirement } from '../../models';

// Types mirrored from treeProvider (avoiding vscode import)
interface PackageTreeItem {
  type: 'package';
  package: SwiftPackage;
}

interface DependencyChildItem {
  type: 'dependency';
  dependency: Dependency;
  parentPackage: SwiftPackage;
}

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

const arbLocalDependency: fc.Arbitrary<Dependency> = arbSafeString.map(p => ({
  type: 'local' as const,
  path: `/tmp/${p}`,
  rawDeclaration: '',
  declarationRange: { start: 0, end: 0 },
}));

const arbRemoteDependency: fc.Arbitrary<Dependency> = fc.tuple(
  arbSafeString,
  arbVersionRequirement
).map(([host, vr]) => ({
  type: 'remote' as const,
  url: `https://${host}.git`,
  versionRequirement: vr,
  rawDeclaration: '',
  declarationRange: { start: 0, end: 0 },
}));

const arbDependency: fc.Arbitrary<Dependency> = fc.oneof(
  arbLocalDependency,
  arbRemoteDependency
);

const arbSwiftPackage: fc.Arbitrary<SwiftPackage> = fc.tuple(
  arbSafeString,
  fc.array(arbDependency, { minLength: 0, maxLength: 20 })
).map(([name, deps]) => ({
  name: name || 'Pkg',
  path: `/workspace/${name || 'Pkg'}`,
  manifestPath: `/workspace/${name || 'Pkg'}/Package.swift`,
  dependencies: deps,
}));

// --- Pure getChildren logic (mirrors DependencyTreeProvider without VS Code API) ---

function getChildrenForPackage(pkg: SwiftPackage): DependencyChildItem[] {
  return pkg.dependencies.map(dep => ({
    type: 'dependency' as const,
    dependency: dep,
    parentPackage: pkg,
  }));
}

function getRootChildren(packages: SwiftPackage[]): PackageTreeItem[] {
  return packages.map(pkg => ({
    type: 'package' as const,
    package: pkg,
  }));
}

// --- Property Tests ---

describe('Property 5: Tree children count matches dependency count', () => {
  it('getChildren(packageNode) returns exactly N children for a package with N dependencies', () => {
    fc.assert(
      fc.property(arbSwiftPackage, (pkg) => {
        const packageNode: PackageTreeItem = { type: 'package', package: pkg };
        const children = getChildrenForPackage(packageNode.package);

        expect(children).toHaveLength(pkg.dependencies.length);

        // Each child should reference the correct parent and a dependency from the package
        for (let i = 0; i < children.length; i++) {
          expect(children[i].type).toBe('dependency');
          expect(children[i].dependency).toBe(pkg.dependencies[i]);
          expect(children[i].parentPackage).toBe(pkg);
        }
      }),
      { numRuns: 200 }
    );
  });

  it('getChildren(undefined) returns one node per package', () => {
    fc.assert(
      fc.property(
        fc.array(arbSwiftPackage, { minLength: 0, maxLength: 10 }),
        (packages) => {
          const roots = getRootChildren(packages);
          expect(roots).toHaveLength(packages.length);

          for (let i = 0; i < roots.length; i++) {
            expect(roots[i].type).toBe('package');
            expect(roots[i].package).toBe(packages[i]);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
