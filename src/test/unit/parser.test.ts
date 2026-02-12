import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { parseDependencyDeclaration, parsePackageSwift } from '../../parser';

// Helper to create a temp Package.swift file and return its path
function writeTempPackageSwift(content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'swift-dep-test-'));
  const filePath = path.join(dir, 'Package.swift');
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

function cleanupTempFile(filePath: string) {
  try {
    fs.unlinkSync(filePath);
    fs.rmdirSync(path.dirname(filePath));
  } catch { /* ignore */ }
}

describe('parseDependencyDeclaration', () => {
  describe('local dependencies', () => {
    it('extracts a simple local path', () => {
      const decl = '.package(path: "/Users/fullarm/Projects/iOS/facore")';
      const dep = parseDependencyDeclaration(decl);
      expect(dep).not.toBeNull();
      expect(dep!.type).toBe('local');
      if (dep!.type === 'local') {
        expect(dep!.path).toBe('/Users/fullarm/Projects/iOS/facore');
      }
    });

    it('extracts a multiline local path', () => {
      const decl = `.package(
            path: "/Users/fullarm/Projects/iOS/facore",
        )`;
      const dep = parseDependencyDeclaration(decl);
      expect(dep).not.toBeNull();
      expect(dep!.type).toBe('local');
      if (dep!.type === 'local') {
        expect(dep!.path).toBe('/Users/fullarm/Projects/iOS/facore');
      }
    });
  });

  describe('remote dependencies', () => {
    it('parses .upToNextMajor(from:)', () => {
      const decl = '.package(url: "https://github.com/example/Lib.git", .upToNextMajor(from: "2.0.0"))';
      const dep = parseDependencyDeclaration(decl);
      expect(dep).not.toBeNull();
      expect(dep!.type).toBe('remote');
      if (dep!.type === 'remote') {
        expect(dep!.url).toBe('https://github.com/example/Lib.git');
        expect(dep!.versionRequirement).toEqual({ type: 'upToNextMajor', version: '2.0.0' });
      }
    });

    it('parses .upToNextMinor(from:)', () => {
      const decl = `.package(
            url: "http://repo.internal.servicesintegration.me/fullcontrol/mobile/ios/fullarm/facore.git",
            .upToNextMinor(from: "1.6.0")
        )`;
      const dep = parseDependencyDeclaration(decl);
      expect(dep).not.toBeNull();
      expect(dep!.type).toBe('remote');
      if (dep!.type === 'remote') {
        expect(dep!.url).toBe('http://repo.internal.servicesintegration.me/fullcontrol/mobile/ios/fullarm/facore.git');
        expect(dep!.versionRequirement).toEqual({ type: 'upToNextMinor', version: '1.6.0' });
      }
    });

    it('parses standalone from:', () => {
      const decl = '.package(url: "https://github.com/example/Lib.git", from: "1.0.0")';
      const dep = parseDependencyDeclaration(decl);
      expect(dep).not.toBeNull();
      expect(dep!.type).toBe('remote');
      if (dep!.type === 'remote') {
        expect(dep!.versionRequirement).toEqual({ type: 'from', version: '1.0.0' });
      }
    });

    it('parses exact: version', () => {
      const decl = '.package(url: "https://github.com/Alamofire/Alamofire.git", exact: "5.6.4")';
      const dep = parseDependencyDeclaration(decl);
      expect(dep).not.toBeNull();
      expect(dep!.type).toBe('remote');
      if (dep!.type === 'remote') {
        expect(dep!.url).toBe('https://github.com/Alamofire/Alamofire.git');
        expect(dep!.versionRequirement).toEqual({ type: 'exact', version: '5.6.4' });
      }
    });

    it('parses .exact() syntax', () => {
      const decl = '.package(url: "https://github.com/example/Lib.git", .exact("3.1.0"))';
      const dep = parseDependencyDeclaration(decl);
      expect(dep).not.toBeNull();
      expect(dep!.type).toBe('remote');
      if (dep!.type === 'remote') {
        expect(dep!.versionRequirement).toEqual({ type: 'exact', version: '3.1.0' });
      }
    });

    it('parses branch:', () => {
      const decl = `.package(
            url: "http://repo.internal.servicesintegration.me/fullcontrol/mobile/ios/mobileioscore.git",
            branch: "dev"
        )`;
      const dep = parseDependencyDeclaration(decl);
      expect(dep).not.toBeNull();
      expect(dep!.type).toBe('remote');
      if (dep!.type === 'remote') {
        expect(dep!.versionRequirement).toEqual({ type: 'branch', name: 'dev' });
      }
    });

    it('parses revision:', () => {
      const decl = '.package(url: "https://github.com/example/Lib.git", revision: "abc123def456")';
      const dep = parseDependencyDeclaration(decl);
      expect(dep).not.toBeNull();
      expect(dep!.type).toBe('remote');
      if (dep!.type === 'remote') {
        expect(dep!.versionRequirement).toEqual({ type: 'revision', hash: 'abc123def456' });
      }
    });
  });

  describe('from: disambiguation', () => {
    it('does not match from: inside .upToNextMajor as standalone from', () => {
      const decl = '.package(url: "https://example.com/Lib.git", .upToNextMajor(from: "2.0.0"))';
      const dep = parseDependencyDeclaration(decl);
      expect(dep).not.toBeNull();
      expect(dep!.type).toBe('remote');
      if (dep!.type === 'remote') {
        expect(dep!.versionRequirement.type).toBe('upToNextMajor');
      }
    });

    it('does not match from: inside .upToNextMinor as standalone from', () => {
      const decl = '.package(url: "https://example.com/Lib.git", .upToNextMinor(from: "1.5.0"))';
      const dep = parseDependencyDeclaration(decl);
      expect(dep).not.toBeNull();
      expect(dep!.type).toBe('remote');
      if (dep!.type === 'remote') {
        expect(dep!.versionRequirement.type).toBe('upToNextMinor');
      }
    });
  });

  describe('edge cases', () => {
    it('returns null for unrecognized syntax', () => {
      const dep = parseDependencyDeclaration('.package(name: "SomeLib")');
      expect(dep).toBeNull();
    });

    it('returns null for url without version requirement', () => {
      const dep = parseDependencyDeclaration('.package(url: "https://example.com/Lib.git")');
      expect(dep).toBeNull();
    });

    it('ignores commented-out path inside a declaration', () => {
      const decl = `.package(
//            path: "/Users/joaoduarte/Documents/FullControl/facore"
            url: "http://repo.internal.servicesintegration.me/fullcontrol/mobile/ios/fullarm/facore.git",
            .upToNextMinor(from: "1.6.0")
        )`;
      const dep = parseDependencyDeclaration(decl);
      expect(dep).not.toBeNull();
      expect(dep!.type).toBe('remote');
      if (dep!.type === 'remote') {
        expect(dep!.url).toBe('http://repo.internal.servicesintegration.me/fullcontrol/mobile/ios/fullarm/facore.git');
      }
    });
  });
});

describe('parsePackageSwift', () => {
  const tempFiles: string[] = [];

  afterAll(() => {
    tempFiles.forEach(f => cleanupTempFile(f));
  });

  it('extracts package name and local dependency', async () => {
    const content = `
// swift-tools-version: 5.8
import PackageDescription

let package = Package(
    name: "Alarm",
    dependencies: [
        .package(path: "/Users/fullarm/Projects/iOS/facore"),
    ],
    targets: []
)
`;
    const filePath = writeTempPackageSwift(content);
    tempFiles.push(filePath);

    const result = await parsePackageSwift(filePath);
    expect(result.packageName).toBe('Alarm');
    expect(result.dependencies).toHaveLength(1);
    expect(result.dependencies[0].type).toBe('local');
    if (result.dependencies[0].type === 'local') {
      expect(result.dependencies[0].path).toBe('/Users/fullarm/Projects/iOS/facore');
    }
    expect(result.errors).toHaveLength(0);
  });

  it('parses mixed local and remote dependencies', async () => {
    const content = `
import PackageDescription

let package = Package(
    name: "MixedPkg",
    dependencies: [
        .package(path: "/local/path/to/lib"),
        .package(url: "https://github.com/Alamofire/Alamofire.git", exact: "5.6.4"),
        .package(url: "https://github.com/example/Other.git", branch: "main"),
    ],
    targets: []
)
`;
    const filePath = writeTempPackageSwift(content);
    tempFiles.push(filePath);

    const result = await parsePackageSwift(filePath);
    expect(result.packageName).toBe('MixedPkg');
    expect(result.dependencies).toHaveLength(3);
    expect(result.dependencies[0].type).toBe('local');
    expect(result.dependencies[1].type).toBe('remote');
    expect(result.dependencies[2].type).toBe('remote');
    if (result.dependencies[1].type === 'remote') {
      expect(result.dependencies[1].versionRequirement).toEqual({ type: 'exact', version: '5.6.4' });
    }
    if (result.dependencies[2].type === 'remote') {
      expect(result.dependencies[2].versionRequirement).toEqual({ type: 'branch', name: 'main' });
    }
    expect(result.errors).toHaveLength(0);
  });

  it('skips commented-out .package lines', async () => {
    const content = `
import PackageDescription

let package = Package(
    name: "WithComments",
    dependencies: [
        .package(url: "https://github.com/Alamofire/Alamofire.git", exact: "5.6.4"),
//        .package(path: "/Users/joaoduarte/Documents/FullControl/MobileiOSCore"),
        .package(url: "http://repo.example.com/lib.git", branch: "dev"),
    ],
    targets: []
)
`;
    const filePath = writeTempPackageSwift(content);
    tempFiles.push(filePath);

    const result = await parsePackageSwift(filePath);
    expect(result.packageName).toBe('WithComments');
    expect(result.dependencies).toHaveLength(2);
    expect(result.dependencies[0].type).toBe('remote');
    expect(result.dependencies[1].type).toBe('remote');
    expect(result.errors).toHaveLength(0);
  });

  it('handles empty dependencies array', async () => {
    const content = `
import PackageDescription

let package = Package(
    name: "EmptyDeps",
    dependencies: [],
    targets: []
)
`;
    const filePath = writeTempPackageSwift(content);
    tempFiles.push(filePath);

    const result = await parsePackageSwift(filePath);
    expect(result.packageName).toBe('EmptyDeps');
    expect(result.dependencies).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it('produces warnings for unrecognized dependency syntax', async () => {
    const content = `
import PackageDescription

let package = Package(
    name: "BadDeps",
    dependencies: [
        .package(url: "https://github.com/example/Lib.git", exact: "1.0.0"),
        .package(name: "UnknownLib"),
    ],
    targets: []
)
`;
    const filePath = writeTempPackageSwift(content);
    tempFiles.push(filePath);

    const result = await parsePackageSwift(filePath);
    expect(result.packageName).toBe('BadDeps');
    expect(result.dependencies).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].rawText).toContain('.package(name: "UnknownLib")');
  });

  it('sets correct declaration ranges', async () => {
    const content = `import PackageDescription

let package = Package(
    name: "RangeTest",
    dependencies: [
        .package(path: "/some/path"),
    ],
    targets: []
)
`;
    const filePath = writeTempPackageSwift(content);
    tempFiles.push(filePath);

    const result = await parsePackageSwift(filePath);
    expect(result.dependencies).toHaveLength(1);
    const dep = result.dependencies[0];
    // Verify the range points to the actual declaration in the file
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const extracted = fileContent.substring(dep.declarationRange.start, dep.declarationRange.end);
    expect(extracted).toBe('.package(path: "/some/path")');
  });

  it('does not confuse target dependencies with package dependencies', async () => {
    const content = `
import PackageDescription

let package = Package(
    name: "TargetTest",
    dependencies: [
        .package(path: "/local/facore"),
    ],
    targets: [
        .target(
            name: "MyTarget",
            dependencies: [
                .product(name: "FACore", package: "facore"),
            ]
        ),
    ]
)
`;
    const filePath = writeTempPackageSwift(content);
    tempFiles.push(filePath);

    const result = await parsePackageSwift(filePath);
    expect(result.packageName).toBe('TargetTest');
    expect(result.dependencies).toHaveLength(1);
    expect(result.dependencies[0].type).toBe('local');
  });
});
