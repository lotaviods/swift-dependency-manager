import * as fs from 'fs';
import * as path from 'path';
import { SwiftPackage } from './models';
import { parsePackageSwift } from './parser';

/** Directories to skip during workspace scanning */
const SKIP_DIRS = new Set(['.build', '.git', 'node_modules', 'Pods', 'build']);

/**
 * Recursively scan for Swift packages (containing Package.swift) and .xcodeproj bundles.
 * Also detects Git submodules via .gitmodules.
 * Returns discovered packages sorted alphabetically by name (case-insensitive).
 */
export async function discoverPackages(workspaceRoot: string): Promise<SwiftPackage[]> {
  const packages: SwiftPackage[] = [];
  const discoveredPaths = new Set<string>();

  async function scanDirectory(dir: string, depth: number = 0): Promise<void> {
    // Limit recursion depth to avoid infinite loops
    if (depth > 5) {
      return;
    }

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    // Check for .gitmodules in this directory
    const gitmodulesPath = path.join(dir, '.gitmodules');
    if (fs.existsSync(gitmodulesPath)) {
      const submodules = parseGitmodules(gitmodulesPath);
      for (const sub of submodules) {
        const subPath = path.join(dir, sub.path);
        if (discoveredPaths.has(subPath)) { continue; }

        const isEmpty = isDirectoryEmpty(subPath);
        const manifestPath = path.join(subPath, 'Package.swift');

        if (!isEmpty && fs.existsSync(manifestPath)) {
          // Submodule is initialized and has Package.swift — will be found by normal scan
          continue;
        }

        // Add as empty/uninitialized submodule
        discoveredPaths.add(subPath);
        packages.push({
          name: sub.name,
          path: subPath,
          manifestPath: isEmpty ? '' : manifestPath,
          dependencies: [],
          isSubmodule: true,
          isEmptySubmodule: isEmpty,
        });
      }
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      // Skip excluded directory names
      if (SKIP_DIRS.has(entry.name)) {
        continue;
      }

      const dirPath = path.join(dir, entry.name);
      const manifestPath = path.join(dirPath, 'Package.swift');

      // Check for Package.swift
      if (fs.existsSync(manifestPath)) {
        if (!discoveredPaths.has(dirPath)) {
          try {
            const result = await parsePackageSwift(manifestPath);
            discoveredPaths.add(dirPath);
            packages.push({
              name: result.packageName,
              path: dirPath,
              manifestPath,
              dependencies: result.dependencies,
            });
          } catch {
            // Skip packages that fail to parse
          }
        }
        // Don't recurse into directories with Package.swift
        continue;
      }

      // Check for .xcodeproj bundle (directory ending in .xcodeproj)
      if (entry.name.endsWith('.xcodeproj')) {
        if (!discoveredPaths.has(dirPath)) {
          discoveredPaths.add(dirPath);
          packages.push({
            name: entry.name.replace(/\.xcodeproj$/, ''),
            path: dirPath,
            manifestPath: '', // No Package.swift for Xcode projects
            dependencies: [],
          });
        }
        continue;
      }

      // Recurse into subdirectories
      await scanDirectory(dirPath, depth + 1);
    }
  }

  await scanDirectory(workspaceRoot);

  // Sort alphabetically by name, case-insensitive
  packages.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

  return packages;
}

/** Parse .gitmodules file and extract submodule name and path */
function parseGitmodules(filePath: string): Array<{ name: string; path: string }> {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const submodules: Array<{ name: string; path: string }> = [];
    let currentName = '';
    let currentPath = '';

    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      const submoduleMatch = trimmed.match(/^\[submodule\s+"(.+)"\]$/);
      if (submoduleMatch) {
        if (currentName && currentPath) {
          submodules.push({ name: currentName, path: currentPath });
        }
        currentName = submoduleMatch[1];
        currentPath = '';
        continue;
      }
      const pathMatch = trimmed.match(/^path\s*=\s*(.+)$/);
      if (pathMatch) {
        currentPath = pathMatch[1].trim();
      }
    }
    if (currentName && currentPath) {
      submodules.push({ name: currentName, path: currentPath });
    }
    return submodules;
  } catch {
    return [];
  }
}

/** Check if a directory is empty or doesn't exist */
function isDirectoryEmpty(dirPath: string): boolean {
  try {
    const entries = fs.readdirSync(dirPath);
    return entries.length === 0;
  } catch {
    return true; // Directory doesn't exist = treat as empty
  }
}


/**
 * Create a FileSystemWatcher for Package.swift files.
 * Requires the VS Code API — call this from the extension entry point.
 *
 * Returns a disposable watcher and an event emitter that fires
 * whenever Package.swift files are created, deleted, or changed.
 */
export function createPackageWatcher(vscodeWorkspace: typeof import('vscode').workspace): {
  watcher: import('vscode').FileSystemWatcher;
  onDidChangePackages: import('vscode').Event<void>;
  dispose: () => void;
} {
  // Lazy-import vscode to avoid issues in test environments
  const vscode = require('vscode') as typeof import('vscode');

  const emitter = new vscode.EventEmitter<void>();
  const watcher = vscodeWorkspace.createFileSystemWatcher('**/Package.swift');

  const subscriptions: import('vscode').Disposable[] = [];

  subscriptions.push(watcher.onDidCreate(() => emitter.fire()));
  subscriptions.push(watcher.onDidDelete(() => emitter.fire()));
  subscriptions.push(watcher.onDidChange(() => emitter.fire()));

  return {
    watcher,
    onDidChangePackages: emitter.event,
    dispose: () => {
      watcher.dispose();
      emitter.dispose();
      subscriptions.forEach(s => s.dispose());
    },
  };
}
