/**
 * Bulk Update Service — pure-logic module for computing dependency
 * replacement operations across multiple Swift packages.
 * No VS Code API dependencies.
 */
import { Dependency, SwiftPackage } from './models';
import { getDependencyName } from './treeLabels';

/** A single replacement operation to be applied to a Package.swift file */
export interface ReplacementOperation {
  /** Path to the Package.swift file */
  filePath: string;
  /** The existing dependency to replace */
  oldDependency: Dependency;
  /** The new dependency value */
  newDependency: Dependency;
}

/** Result of applying bulk replacements */
export interface BulkUpdateResult {
  /** Number of files successfully updated */
  successCount: number;
  /** Failures with file path and error message */
  failures: Array<{ filePath: string; error: string }>;
}

/**
 * Compute the list of replacement operations needed to update all occurrences
 * of a named dependency across the given packages.
 *
 * This is a pure function — no file I/O, no VS Code API.
 */
export function computeReplacements(
  dependencyName: string,
  newDependency: Dependency,
  packages: SwiftPackage[]
): ReplacementOperation[] {
  const operations: ReplacementOperation[] = [];

  for (const pkg of packages) {
    for (const dep of pkg.dependencies) {
      if (getDependencyName(dep) === dependencyName) {
        operations.push({
          filePath: pkg.manifestPath,
          oldDependency: dep,
          newDependency,
        });
      }
    }
  }

  return operations;
}
