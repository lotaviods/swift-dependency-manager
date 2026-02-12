import * as fs from 'fs';
import {
  Dependency,
  LocalDependency,
  RemoteDependency,
  VersionRequirement,
  ParseResult,
  ParseWarning,
} from './models';

/**
 * Parse a version requirement from a .package(url: ...) declaration string.
 * Checks for .upToNextMajor and .upToNextMinor first to avoid false matches
 * on standalone `from:`.
 */
function parseVersionRequirement(declaration: string): VersionRequirement | null {
  // 1. .upToNextMajor(from: "X.Y.Z")
  const upToNextMajorMatch = declaration.match(/\.upToNextMajor\(\s*from:\s*"([^"]+)"\s*\)/);
  if (upToNextMajorMatch) {
    return { type: 'upToNextMajor', version: upToNextMajorMatch[1] };
  }

  // 2. .upToNextMinor(from: "X.Y.Z")
  const upToNextMinorMatch = declaration.match(/\.upToNextMinor\(\s*from:\s*"([^"]+)"\s*\)/);
  if (upToNextMinorMatch) {
    return { type: 'upToNextMinor', version: upToNextMinorMatch[1] };
  }

  // 3. .exact("X.Y.Z") or exact: "X.Y.Z"
  const exactDotMatch = declaration.match(/\.exact\(\s*"([^"]+)"\s*\)/);
  if (exactDotMatch) {
    return { type: 'exact', version: exactDotMatch[1] };
  }
  const exactColonMatch = declaration.match(/exact:\s*"([^"]+)"/);
  if (exactColonMatch) {
    return { type: 'exact', version: exactColonMatch[1] };
  }

  // 4. branch: "name"
  const branchMatch = declaration.match(/branch:\s*"([^"]+)"/);
  if (branchMatch) {
    return { type: 'branch', name: branchMatch[1] };
  }

  // 5. revision: "hash"
  const revisionMatch = declaration.match(/revision:\s*"([^"]+)"/);
  if (revisionMatch) {
    return { type: 'revision', hash: revisionMatch[1] };
  }

  // 6. Standalone from: "X.Y.Z" — only match if NOT preceded by upToNextMajor/upToNextMinor
  //    Since we already checked those above and returned, any remaining `from:` is standalone.
  const fromMatch = declaration.match(/from:\s*"([^"]+)"/);
  if (fromMatch) {
    return { type: 'from', version: fromMatch[1] };
  }

  return null;
}

/**
 * Parse a single .package(...) declaration string into a Dependency object.
 * Returns null if the declaration cannot be recognized as a local or remote dependency.
 */
/**
 * Strip single-line comments from Swift code while preserving `//` inside string literals.
 */
function stripLineComments(code: string): string {
  let result = '';
  let inString = false;

  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    const next = i + 1 < code.length ? code[i + 1] : '';

    if (inString) {
      result += ch;
      if (ch === '\\') {
        // Skip escaped character
        if (i + 1 < code.length) {
          result += code[i + 1];
          i++;
        }
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      result += ch;
      continue;
    }

    if (ch === '/' && next === '/') {
      // Skip to end of line
      const eol = code.indexOf('\n', i);
      if (eol === -1) {
        break; // Rest of string is a comment
      }
      i = eol - 1; // Will be incremented by loop
      continue;
    }

    result += ch;
  }

  return result;
}

export function parseDependencyDeclaration(declaration: string): Dependency | null {
  // Strip single-line comments while preserving // inside string literals (URLs)
  const stripped = stripLineComments(declaration);

  // Check for local dependency: path: "..."
  const pathMatch = stripped.match(/path:\s*"([^"]+)"/);
  if (pathMatch) {
    const dep: LocalDependency = {
      type: 'local',
      path: pathMatch[1],
      rawDeclaration: declaration,
      declarationRange: { start: 0, end: 0 }, // Will be set by parsePackageSwift
    };
    return dep;
  }

  // Check for remote dependency: url: "..."
  const urlMatch = stripped.match(/url:\s*"([^"]+)"/);
  if (urlMatch) {
    const versionReq = parseVersionRequirement(stripped);
    if (!versionReq) {
      return null;
    }
    const dep: RemoteDependency = {
      type: 'remote',
      url: urlMatch[1],
      versionRequirement: versionReq,
      rawDeclaration: declaration,
      declarationRange: { start: 0, end: 0 }, // Will be set by parsePackageSwift
    };
    return dep;
  }

  return null;
}

/**
 * Find the matching closing bracket for an opening bracket at the given position.
 * Uses bracket counting to handle nested brackets.
 */
function findMatchingBracket(content: string, openPos: number): number {
  let depth = 0;
  let inString = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = openPos; i < content.length; i++) {
    const ch = content[i];
    const next = i + 1 < content.length ? content[i + 1] : '';

    // Handle line comments
    if (!inString && !inBlockComment && ch === '/' && next === '/') {
      inLineComment = true;
      continue;
    }
    if (inLineComment) {
      if (ch === '\n') {
        inLineComment = false;
      }
      continue;
    }

    // Handle block comments
    if (!inString && !inLineComment && ch === '/' && next === '*') {
      inBlockComment = true;
      i++; // skip *
      continue;
    }
    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        i++; // skip /
      }
      continue;
    }

    // Handle strings
    if (!inLineComment && !inBlockComment && ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) {
      if (ch === '\\') {
        i++; // skip escaped character
      }
      continue;
    }

    // Count brackets
    if (ch === '[') {
      depth++;
    } else if (ch === ']') {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }

  return -1; // No matching bracket found
}

/**
 * Split the dependencies array content into individual .package(...) declarations.
 * Uses bracket/parenthesis counting to correctly handle nested structures.
 */
function splitPackageDeclarations(
  depsContent: string,
  depsArrayStart: number
): Array<{ text: string; start: number; end: number }> {
  const results: Array<{ text: string; start: number; end: number }> = [];

  let i = 0;
  while (i < depsContent.length) {
    // Find the next .package( occurrence
    const packageIdx = depsContent.indexOf('.package(', i);
    if (packageIdx === -1) {
      break;
    }

    // Check if this .package is inside a comment
    const lineStart = depsContent.lastIndexOf('\n', packageIdx) + 1;
    const lineBeforePackage = depsContent.substring(lineStart, packageIdx);
    if (lineBeforePackage.trimStart().startsWith('//')) {
      i = packageIdx + 9;
      continue;
    }

    // Find the opening paren position (the one right after .package)
    const openParen = packageIdx + 8; // index of '('

    // Count parentheses to find the matching close
    let depth = 0;
    let inString = false;
    let inLineComment = false;
    let end = -1;

    for (let j = openParen; j < depsContent.length; j++) {
      const ch = depsContent[j];
      const next = j + 1 < depsContent.length ? depsContent[j + 1] : '';

      if (!inString && !inLineComment && ch === '/' && next === '/') {
        inLineComment = true;
        continue;
      }
      if (inLineComment) {
        if (ch === '\n') {
          inLineComment = false;
        }
        continue;
      }

      if (!inLineComment && ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) {
        if (ch === '\\') {
          j++;
        }
        continue;
      }

      if (ch === '(') {
        depth++;
      } else if (ch === ')') {
        depth--;
        if (depth === 0) {
          end = j;
          break;
        }
      }
    }

    if (end === -1) {
      break; // Malformed — couldn't find matching paren
    }

    const declText = depsContent.substring(packageIdx, end + 1);
    const absoluteStart = depsArrayStart + packageIdx;
    const absoluteEnd = depsArrayStart + end + 1;
    results.push({ text: declText, start: absoluteStart, end: absoluteEnd });

    i = end + 1;
  }

  return results;
}


/**
 * Parse a Package.swift file and return structured dependency data.
 * Extracts the package name, locates the dependencies array, and parses
 * each .package(...) declaration.
 */
export async function parsePackageSwift(filePath: string): Promise<ParseResult> {
  const content = fs.readFileSync(filePath, 'utf-8');

  const errors: ParseWarning[] = [];
  const dependencies: Dependency[] = [];

  // Extract package name from: name: "PackageName"
  const nameMatch = content.match(/name:\s*"([^"]+)"/);
  const packageName = nameMatch ? nameMatch[1] : 'Unknown';

  // Locate the top-level dependencies: [ ... ] array.
  // We need to find `dependencies:` followed by `[` at the Package(...) level,
  // not inside a target's dependencies.
  // Strategy: find `dependencies: [` that is NOT inside a .target(...) or .testTarget(...)
  // The top-level dependencies array is a direct parameter of Package(...).
  const depsRegex = /dependencies:\s*\[/g;
  let depsMatch: RegExpExecArray | null;
  let depsArrayStart = -1;
  let depsArrayOpenBracket = -1;

  while ((depsMatch = depsRegex.exec(content)) !== null) {
    const bracketPos = depsMatch.index + depsMatch[0].length - 1;

    // Check if this is the top-level dependencies array by looking at context.
    // The top-level one appears before `targets:` and is not inside a .target() call.
    // Simple heuristic: count open parens before this position. If we're inside
    // the Package() call but not inside a nested .target() call, it's top-level.
    // Better heuristic: check if the preceding non-whitespace context suggests
    // we're at the Package level (preceded by ], or by the products section closing).

    // Actually, the simplest reliable approach: the first `dependencies: [` that
    // contains `.package(` entries is the one we want. Target dependencies use
    // .product() or string literals, not .package().
    const closeBracket = findMatchingBracket(content, bracketPos);
    if (closeBracket === -1) {
      continue;
    }

    const arrayContent = content.substring(bracketPos + 1, closeBracket);
    // Check if this array contains .package( — that means it's the package-level deps
    if (arrayContent.includes('.package(') || arrayContent.trim() === '') {
      depsArrayStart = bracketPos + 1;
      depsArrayOpenBracket = bracketPos;
      break;
    }
  }

  if (depsArrayStart === -1) {
    // No dependencies array found — could be a package with no dependencies section
    return { packageName, dependencies: [], errors };
  }

  const closeBracket = findMatchingBracket(content, depsArrayOpenBracket);
  if (closeBracket === -1) {
    errors.push({
      filePath,
      message: 'Could not find closing bracket for dependencies array',
      rawText: '',
    });
    return { packageName, dependencies: [], errors };
  }

  const depsContent = content.substring(depsArrayStart, closeBracket);

  // Split into individual .package(...) declarations
  const declarations = splitPackageDeclarations(depsContent, depsArrayStart);

  for (const decl of declarations) {
    const dep = parseDependencyDeclaration(decl.text);
    if (dep) {
      dep.declarationRange = { start: decl.start, end: decl.end };
      dep.rawDeclaration = decl.text;
      dependencies.push(dep);
    } else {
      errors.push({
        filePath,
        message: `Unrecognized dependency declaration`,
        rawText: decl.text,
      });
    }
  }

  return { packageName, dependencies, errors };
}
