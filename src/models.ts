/** Character offset range within a Package.swift file */
export interface DeclarationRange {
  /** Start character offset (inclusive) */
  start: number;
  /** End character offset (exclusive) */
  end: number;
}

/** Version requirement variants for remote dependencies */
export type VersionRequirement =
  | { type: 'upToNextMajor'; version: string }
  | { type: 'upToNextMinor'; version: string }
  | { type: 'from'; version: string }
  | { type: 'exact'; version: string }
  | { type: 'branch'; name: string }
  | { type: 'revision'; hash: string };

/** A dependency specified using a local filesystem path */
export interface LocalDependency {
  type: 'local';
  path: string;
  rawDeclaration: string;
  declarationRange: DeclarationRange;
}

/** A dependency specified using a remote URL and version requirement */
export interface RemoteDependency {
  type: 'remote';
  url: string;
  versionRequirement: VersionRequirement;
  rawDeclaration: string;
  declarationRange: DeclarationRange;
}

/** Union type for all dependency kinds */
export type Dependency = LocalDependency | RemoteDependency;

/** A discovered Swift package in the workspace */
export interface SwiftPackage {
  name: string;
  path: string;
  manifestPath: string;
  dependencies: Dependency[];
}

/** Warning produced when a dependency declaration cannot be parsed */
export interface ParseWarning {
  filePath: string;
  message: string;
  rawText: string;
}

/** Result of parsing a Package.swift file */
export interface ParseResult {
  packageName: string;
  dependencies: Dependency[];
  errors: ParseWarning[];
}
