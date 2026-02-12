import { SwiftPackage, Dependency } from './models';
import { getDependencyName, formatDependencyLabel } from './treeLabels';

/** A single entry within a dependency group */
export interface DependencyGroupEntry {
  packageName: string;
  dependency: Dependency;
}

/** A group of dependencies sharing the same name across packages */
export interface DependencyGroup {
  name: string;
  entries: DependencyGroupEntry[];
  isInconsistent: boolean;
}

/**
 * Determine whether a dependency group has inconsistencies.
 * Inconsistency means entries have different source types (local vs remote)
 * or different version requirements.
 */
function detectInconsistency(entries: DependencyGroupEntry[]): boolean {
  if (entries.length < 2) {
    return false;
  }

  const first = entries[0].dependency;

  for (let i = 1; i < entries.length; i++) {
    const dep = entries[i].dependency;

    // Different source types → inconsistent
    if (dep.type !== first.type) {
      return true;
    }

    // Both remote but different version requirements → inconsistent
    if (dep.type === 'remote' && first.type === 'remote') {
      const a = formatDependencyLabel(first);
      const b = formatDependencyLabel(dep);
      if (a !== b) {
        return true;
      }
    }

    // Both local but different paths → inconsistent
    if (dep.type === 'local' && first.type === 'local') {
      if (dep.path !== first.path) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Group all dependencies across packages by dependency name.
 * Detects inconsistencies where the same dependency name has different
 * versions or source types across packages.
 */
export function groupDependenciesByName(packages: SwiftPackage[]): DependencyGroup[] {
  const groupMap = new Map<string, DependencyGroupEntry[]>();

  for (const pkg of packages) {
    for (const dep of pkg.dependencies) {
      const name = getDependencyName(dep);
      let entries = groupMap.get(name);
      if (!entries) {
        entries = [];
        groupMap.set(name, entries);
      }
      entries.push({ packageName: pkg.name, dependency: dep });
    }
  }

  const groups: DependencyGroup[] = [];
  for (const [name, entries] of groupMap) {
    groups.push({
      name,
      entries,
      isInconsistent: detectInconsistency(entries),
    });
  }

  // Sort groups alphabetically by name
  groups.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

  return groups;
}
