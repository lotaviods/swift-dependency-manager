/**
 * Property 2: Package discovery finds all Package.swift directories
 *
 * For any workspace directory structure containing a set of immediate
 * subdirectories, some with Package.swift files and some without, the
 * discovery service should return exactly those subdirectories that contain
 * a Package.swift file (excluding directories in the skip list:
 * .build, .git, node_modules, Pods, build).
 *
 * **Validates: Requirements 1.1, 1.2**
 */
import { describe, it, expect, afterEach } from 'vitest';
import fc from 'fast-check';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { discoverPackages } from '../../discoveryService';

const SKIP_DIRS = ['.build', '.git', 'node_modules', 'Pods', 'build'];

/** Generate a valid directory name that is NOT in the skip list. */
const arbValidDirName = fc
  .stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')), {
    minLength: 1,
    maxLength: 15,
  })
  .filter(name => !SKIP_DIRS.includes(name) && !name.endsWith('.xcodeproj'));

/** Generate a skip-list directory name. */
const arbSkipDirName = fc.constantFrom(...SKIP_DIRS);

/** Generate a package name (alpha). */
const arbPackageName = fc
  .stringOf(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.split('')), {
    minLength: 1,
    maxLength: 20,
  });

/** Minimal Package.swift content with a given name. */
function makePackageSwift(name: string): string {
  return `// swift-tools-version:5.9
import PackageDescription
let package = Package(
    name: "${name}",
    dependencies: []
)
`;
}

let tmpDirs: string[] = [];

afterEach(() => {
  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
  tmpDirs = [];
});

describe('Property 2: Package discovery finds all Package.swift directories', () => {
  it('discovers exactly the subdirectories containing Package.swift, excluding skip dirs', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Unique (dirName, pkgName) tuples for dirs WITH Package.swift
        fc.uniqueArray(fc.tuple(arbValidDirName, arbPackageName), {
          minLength: 0,
          maxLength: 5,
          selector: (entry) => entry[0],
        }),
        // Unique dir names WITHOUT Package.swift
        fc.uniqueArray(arbValidDirName, { minLength: 0, maxLength: 3 }),
        // Skip-list dirs that have Package.swift but should be excluded
        fc.uniqueArray(fc.tuple(arbSkipDirName, arbPackageName), {
          minLength: 0,
          maxLength: 3,
          selector: (entry) => entry[0],
        }),
        async (withPackage, withoutPackage, skipWithPackage) => {
          // Ensure no overlap between withPackage dir names and withoutPackage dir names
          const withPackageNames = new Set(withPackage.map(([d]) => d));
          const filteredWithout = withoutPackage.filter(d => !withPackageNames.has(d));

          // Create temp workspace
          const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'discovery-test-'));
          tmpDirs.push(tmpDir);

          // Create dirs WITH Package.swift
          for (const [dirName, pkgName] of withPackage) {
            const dirPath = path.join(tmpDir, dirName);
            fs.mkdirSync(dirPath, { recursive: true });
            fs.writeFileSync(path.join(dirPath, 'Package.swift'), makePackageSwift(pkgName));
          }

          // Create dirs WITHOUT Package.swift
          for (const dirName of filteredWithout) {
            fs.mkdirSync(path.join(tmpDir, dirName), { recursive: true });
          }

          // Create skip-list dirs WITH Package.swift (should be excluded)
          for (const [dirName, pkgName] of skipWithPackage) {
            const dirPath = path.join(tmpDir, dirName);
            fs.mkdirSync(dirPath, { recursive: true });
            fs.writeFileSync(path.join(dirPath, 'Package.swift'), makePackageSwift(pkgName));
          }

          const result = await discoverPackages(tmpDir);
          const discoveredDirNames = result.map(p => path.basename(p.path));

          // Should find exactly the non-skip dirs that have Package.swift
          const expectedDirNames = withPackage.map(([d]) => d).sort();
          expect(discoveredDirNames.sort()).toEqual(expectedDirNames);

          // Should NOT include any skip-list dirs
          for (const [skipDir] of skipWithPackage) {
            expect(discoveredDirNames).not.toContain(skipDir);
          }

          // Should NOT include dirs without Package.swift
          for (const dirName of filteredWithout) {
            expect(discoveredDirNames).not.toContain(dirName);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
