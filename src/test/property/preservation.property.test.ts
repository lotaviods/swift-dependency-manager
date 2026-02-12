/**
 * Property 7: File replacement preserves non-dependency content
 *
 * For any Package.swift file content and any single dependency replacement
 * operation, all characters outside the replaced `.package(...)` declaration
 * range should remain identical in the output.
 *
 * **Validates: Requirements 4.3**
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { parsePackageSwift } from '../../parser';
import { replaceDependencyInFile, serializeDependency } from '../../serializer';
import type { Dependency, VersionRequirement } from '../../models';

/** Generate a semver-like version string. */
const arbVersion = fc.tuple(
  fc.nat({ max: 99 }),
  fc.nat({ max: 99 }),
  fc.nat({ max: 99 })
).map(([major, minor, patch]) => `${major}.${minor}.${patch}`);

/** Generate a safe string for Swift string literals. */
const arbSafeString = fc.stringOf(
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')),
  { minLength: 1, maxLength: 20 }
);

/** Generate a VersionRequirement. */
const arbVersionRequirement: fc.Arbitrary<VersionRequirement> = fc.oneof(
  arbVersion.map(v => ({ type: 'upToNextMajor' as const, version: v })),
  arbVersion.map(v => ({ type: 'upToNextMinor' as const, version: v })),
  arbVersion.map(v => ({ type: 'from' as const, version: v })),
  arbVersion.map(v => ({ type: 'exact' as const, version: v })),
  arbSafeString.map(n => ({ type: 'branch' as const, name: n })),
  arbSafeString.map(h => ({ type: 'revision' as const, hash: h }))
);

/** Generate a replacement dependency (either local or remote). */
const arbReplacementDep = fc.oneof(
  arbSafeString.map(p => ({
    type: 'local' as const,
    path: `/replacement/${p}`,
    rawDeclaration: '',
    declarationRange: { start: 0, end: 0 },
  })),
  fc.tuple(arbSafeString, arbVersionRequirement).map(([host, vr]) => ({
    type: 'remote' as const,
    url: `https://${host}.example.com/lib.git`,
    versionRequirement: vr,
    rawDeclaration: '',
    declarationRange: { start: 0, end: 0 },
  }))
);

/** Generate a comment string to embed in the Package.swift. */
const arbComment = arbSafeString.map(s => `// ${s}`);

/** Generate a Package.swift with surrounding content and one dependency. */
const arbPackageContent = fc.tuple(
  arbSafeString,       // package name
  arbComment,          // header comment
  arbComment,          // trailing comment
  arbSafeString,       // target name
).map(([pkgName, headerComment, trailingComment, targetName]) => {
  const dep = `.package(path: "/original/path")`;
  return {
    content: `// swift-tools-version: 5.8
${headerComment}
import PackageDescription

let package = Package(
    name: "${pkgName}",
    dependencies: [
        ${dep},
    ],
    targets: [
        .target(
            name: "${targetName}",
            dependencies: []
        ),
    ]
)
${trailingComment}
`,
  };
});

describe('Property 7: File replacement preserves non-dependency content', () => {
  it('content outside the replaced declaration range is unchanged', async () => {
    await fc.assert(
      fc.asyncProperty(arbPackageContent, arbReplacementDep, async ({ content }, newDep) => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'swift-preserve-'));
        const filePath = path.join(dir, 'Package.swift');
        fs.writeFileSync(filePath, content, 'utf-8');

        try {
          const result = await parsePackageSwift(filePath);
          expect(result.dependencies).toHaveLength(1);
          const oldDep = result.dependencies[0];
          const { start, end } = oldDep.declarationRange;

          // Content before and after the declaration
          const before = content.substring(0, start);
          const after = content.substring(end);

          await replaceDependencyInFile(filePath, oldDep, newDep);

          const updatedContent = fs.readFileSync(filePath, 'utf-8');
          const newSerialized = serializeDependency(newDep);

          // Verify content before the declaration is preserved
          expect(updatedContent.substring(0, start)).toBe(before);
          // Verify the new declaration is in place
          expect(updatedContent.substring(start, start + newSerialized.length)).toBe(newSerialized);
          // Verify content after the declaration is preserved
          expect(updatedContent.substring(start + newSerialized.length)).toBe(after);
        } finally {
          try {
            fs.unlinkSync(filePath);
            fs.rmdirSync(dir);
          } catch { /* ignore cleanup errors */ }
        }
      }),
      { numRuns: 100 }
    );
  });
});
