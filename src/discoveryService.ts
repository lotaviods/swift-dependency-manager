import * as fs from 'fs';
import * as path from 'path';
import { SwiftPackage } from './models';
import { parsePackageSwift } from './parser';

/** Directories to skip during workspace scanning */
const SKIP_DIRS = new Set(['.build', '.git', 'node_modules', 'Pods', 'build']);

/**
 * Recursively scan for Swift packages (containing Package.swift) and .xcodeproj bundles.
 * Returns discovered packages sorted alphabetically by name (case-insensitive).
 */
export async function discoverPackages(workspaceRoot: string): Promise<SwiftPackage[]> {
  const packages: SwiftPackage[] = [];

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
        try {
          const result = await parsePackageSwift(manifestPath);
          packages.push({
            name: result.packageName,
            path: dirPath,
            manifestPath,
            dependencies: result.dependencies,
          });
        } catch {
          // Skip packages that fail to parse
        }
        // Don't recurse into directories with Package.swift
        continue;
      }

      // Check for .xcodeproj bundle (directory ending in .xcodeproj)
      if (entry.name.endsWith('.xcodeproj')) {
        packages.push({
          name: entry.name.replace(/\.xcodeproj$/, ''),
          path: dirPath,
          manifestPath: '', // No Package.swift for Xcode projects
          dependencies: [],
        });
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
