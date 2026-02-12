/**
 * Pure label formatting functions for the dependency tree view.
 * These are separated from the VS Code TreeDataProvider so they can be
 * tested independently without the VS Code API.
 */
import { Dependency, VersionRequirement } from './models';

/**
 * Format a VersionRequirement into a human-readable summary string.
 */
export function formatVersionRequirement(vr: VersionRequirement): string {
  switch (vr.type) {
    case 'upToNextMajor':
      return `~> ${vr.version} (major)`;
    case 'upToNextMinor':
      return `~> ${vr.version} (minor)`;
    case 'from':
      return `from ${vr.version}`;
    case 'exact':
      return `exact ${vr.version}`;
    case 'branch':
      return `branch: ${vr.name}`;
    case 'revision':
      return `rev: ${vr.hash}`;
  }
}

/**
 * Format a dependency into a label string for the tree view.
 * Local deps: "Local: {path}"
 * Remote deps: "{versionSummary}"
 */
export function formatDependencyLabel(dep: Dependency): string {
  if (dep.type === 'local') {
    return `Local: ${dep.path}`;
  }
  return formatVersionRequirement(dep.versionRequirement);
}

/**
 * Extract a short name from a dependency for display.
 * For local deps, uses the last path component.
 * For remote deps, extracts the repo name from the URL.
 */
export function getDependencyName(dep: Dependency): string {
  if (dep.type === 'local') {
    const parts = dep.path.replace(/\/+$/, '').split('/');
    return parts[parts.length - 1] || dep.path;
  }
  const cleaned = dep.url.replace(/\.git$/, '');
  const parts = cleaned.split('/');
  return parts[parts.length - 1] || dep.url;
}
