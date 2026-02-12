/**
 * Property 3: Discovered packages are sorted alphabetically
 *
 * For any list of discovered SwiftPackage objects, the returned list should
 * be sorted alphabetically by package name (case-insensitive).
 *
 * **Validates: Requirements 1.4**
 */
import { describe, it, expect, afterEach } from 'vitest';
import fc from 'fast-check';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { discoverPackages } from '../../discoveryService';

/** Generate a package name with mixed case. */
const arbPackageName = fc
  .stringOf(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.split('')), {
    minLength: 1,
    maxLength: 20,
  });

/** Generate a valid directory name (lowercase alphanumeric, no collisions with skip list). */
const arbDirName = fc
  .stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')), {
    minLength: 1,
    maxLength: 15,
  })
  .filter(
    name =>
      !['.build', '.git', 'node_modules', 'Pods', 'build'].includes(name) &&
      !name.endsWith('.xcodeproj')
  );

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

describe('Property 3: Discovered packages are sorted alphabetically', () => {
  it('returns packages sorted by name case-insensitively', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(fc.tuple(arbDirName, arbPackageName), {
          minLength: 2,
          maxLength: 6,
          selector: (entry) => entry[0],
        }),
        async (entries) => {
          const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sorting-test-'));
          tmpDirs.push(tmpDir);

          for (const [dirName, pkgName] of entries) {
            const dirPath = path.join(tmpDir, dirName);
            fs.mkdirSync(dirPath, { recursive: true });
            fs.writeFileSync(path.join(dirPath, 'Package.swift'), makePackageSwift(pkgName));
          }

          const result = await discoverPackages(tmpDir);

          // Verify the result is sorted case-insensitively
          for (let i = 1; i < result.length; i++) {
            const prev = result[i - 1].name.toLowerCase();
            const curr = result[i].name.toLowerCase();
            expect(prev.localeCompare(curr)).toBeLessThanOrEqual(0);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
