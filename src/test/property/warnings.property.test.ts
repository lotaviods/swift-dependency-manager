/**
 * Property 4: Unrecognized dependency syntax produces a warning
 *
 * For any `.package(...)` declaration string that does not contain `path:` or
 * `url:` parameters, the parser should return null (which causes parsePackageSwift
 * to emit a ParseWarning), and should not be included in the dependencies list.
 *
 * **Validates: Requirements 2.6**
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { parseDependencyDeclaration, parsePackageSwift } from '../../parser';

/** Generate a parameter name that is NOT 'path' or 'url'. */
const arbParamName = fc.stringOf(
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')),
  { minLength: 1, maxLength: 15 }
).filter(s => s !== 'path' && s !== 'url');

/** Generate a safe string value (no quotes or backslashes). */
const arbSafeValue = fc.stringOf(
  fc.char().filter(c => c !== '"' && c !== '\\' && c !== '\0' && c !== '(' && c !== ')'),
  { minLength: 1, maxLength: 30 }
);

describe('Property 4: Unrecognized dependency syntax produces a warning', () => {
  it('parseDependencyDeclaration returns null for .package() without path: or url:', () => {
    fc.assert(
      fc.property(arbParamName, arbSafeValue, (paramName, value) => {
        const declaration = `.package(${paramName}: "${value}")`;
        const result = parseDependencyDeclaration(declaration);
        expect(result).toBeNull();
      }),
      { numRuns: 100 }
    );
  });

  it('parsePackageSwift produces a warning for unrecognized .package() declarations', async () => {
    await fc.assert(
      fc.asyncProperty(arbParamName, arbSafeValue, async (paramName, value) => {
        const declaration = `.package(${paramName}: "${value}")`;
        const content = `
import PackageDescription
let package = Package(
    name: "TestPkg",
    dependencies: [
        ${declaration},
    ],
    targets: []
)
`;
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'swift-warn-'));
        const filePath = path.join(dir, 'Package.swift');
        fs.writeFileSync(filePath, content, 'utf-8');

        try {
          const r = await parsePackageSwift(filePath);
          expect(r.dependencies).toHaveLength(0);
          expect(r.errors).toHaveLength(1);
          expect(r.errors[0].rawText).toContain(declaration);
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
