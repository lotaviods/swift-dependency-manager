import { describe, it, expect } from 'vitest';
import { computeReplacements } from '../../bulkUpdate';
import { Dependency, SwiftPackage } from '../../models';

/** Helper to create a local dependency */
function localDep(depPath: string): Dependency {
  return {
    type: 'local',
    path: depPath,
    rawDeclaration: `.package(path: "${depPath}")`,
    declarationRange: { start: 0, end: 0 },
  };
}

/** Helper to create a remote dependency */
function remoteDep(url: string, version: string): Dependency {
  return {
    type: 'remote',
    url,
    versionRequirement: { type: 'from', version },
    rawDeclaration: `.package(url: "${url}", from: "${version}")`,
    declarationRange: { start: 0, end: 0 },
  };
}

/** Helper to create a SwiftPackage */
function makePackage(name: string, deps: Dependency[]): SwiftPackage {
  return {
    name,
    path: `/workspace/${name}`,
    manifestPath: `/workspace/${name}/Package.swift`,
    dependencies: deps,
  };
}

const newDep = remoteDep('https://github.com/example/facore.git', '2.0.0');

describe('computeReplacements', () => {
  it('returns empty operations for an empty package list', () => {
    const result = computeReplacements('facore', newDep, []);
    expect(result).toEqual([]);
  });

  it('returns empty operations when no dependency matches the target name', () => {
    const pkg = makePackage('App', [
      remoteDep('https://github.com/Alamofire/Alamofire.git', '5.0.0'),
      localDep('/libs/Networking'),
    ]);
    const result = computeReplacements('facore', newDep, [pkg]);
    expect(result).toEqual([]);
  });

  it('returns one operation for a single matching dependency', () => {
    const dep = localDep('/libs/facore');
    const pkg = makePackage('App', [dep]);

    const result = computeReplacements('facore', newDep, [pkg]);

    expect(result).toHaveLength(1);
    expect(result[0].filePath).toBe(pkg.manifestPath);
    expect(result[0].oldDependency).toBe(dep);
    expect(result[0].newDependency).toBe(newDep);
  });

  it('returns one operation per match across multiple packages', () => {
    const dep1 = localDep('/libs/facore');
    const dep2 = remoteDep('https://github.com/example/facore.git', '1.0.0');
    const pkg1 = makePackage('App1', [dep1]);
    const pkg2 = makePackage('App2', [dep2]);
    const pkg3 = makePackage('App3', [remoteDep('https://github.com/other/Lib.git', '3.0.0')]);

    const result = computeReplacements('facore', newDep, [pkg1, pkg2, pkg3]);

    expect(result).toHaveLength(2);
    expect(result[0].filePath).toBe(pkg1.manifestPath);
    expect(result[0].oldDependency).toBe(dep1);
    expect(result[1].filePath).toBe(pkg2.manifestPath);
    expect(result[1].oldDependency).toBe(dep2);
  });

  it('does not match dependencies with similar but different names', () => {
    const pkg = makePackage('App', [
      localDep('/libs/facore-utils'),
      remoteDep('https://github.com/example/facore-ui.git', '1.0.0'),
      remoteDep('https://github.com/example/myfacore.git', '1.0.0'),
    ]);

    const result = computeReplacements('facore', newDep, [pkg]);
    expect(result).toEqual([]);
  });
});
