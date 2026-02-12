import * as fs from 'fs';
import {
  Dependency,
  VersionRequirement,
} from './models';

/**
 * Serialize a VersionRequirement into its Swift syntax string.
 */
export function serializeVersionRequirement(vr: VersionRequirement): string {
  switch (vr.type) {
    case 'upToNextMajor':
      return `.upToNextMajor(from: "${vr.version}")`;
    case 'upToNextMinor':
      return `.upToNextMinor(from: "${vr.version}")`;
    case 'from':
      return `from: "${vr.version}"`;
    case 'exact':
      return `exact: "${vr.version}"`;
    case 'branch':
      return `branch: "${vr.name}"`;
    case 'revision':
      return `revision: "${vr.hash}"`;
  }
}

/**
 * Serialize a Dependency into a valid Swift `.package(...)` declaration string.
 */
export function serializeDependency(dep: Dependency): string {
  if (dep.type === 'local') {
    return `.package(path: "${dep.path}")`;
  }
  const vr = serializeVersionRequirement(dep.versionRequirement);
  return `.package(url: "${dep.url}", ${vr})`;
}

/**
 * Replace a dependency declaration in a Package.swift file.
 * Reads the file, locates the old declaration by its declarationRange,
 * replaces it with the serialized new dependency, and writes the file back.
 */
export async function replaceDependencyInFile(
  filePath: string,
  oldDep: Dependency,
  newDep: Dependency
): Promise<void> {
  const content = fs.readFileSync(filePath, 'utf-8');
  const { start, end } = oldDep.declarationRange;
  const newDeclaration = serializeDependency(newDep);
  const updated = content.substring(0, start) + newDeclaration + content.substring(end);
  fs.writeFileSync(filePath, updated, 'utf-8');
}
