# Swift Dependency Manager

A VS Code extension for managing Swift Package Manager dependencies across your workspace. Discover packages, parse dependencies, and toggle between local and remote sources without manual file editing.

## Why This Exists

When developing multiple interdependent Swift packages, developers often need to:

- **Switch between local and remote dependencies** — During development, you want to use local paths to test changes across packages. In CI/production, you need remote URLs pointing to specific versions or branches.
- **Manually edit Package.swift files** — Currently, switching dependencies requires opening each `Package.swift` file and commenting/uncommenting lines or changing URLs by hand.
- **Track version inconsistencies** — When the same dependency is used by multiple packages, it's easy to accidentally use different versions, causing integration issues.
- **Manage many packages** — Workspaces with 10+ Swift packages become unwieldy to manage without tooling.

This extension solves these problems by providing a visual interface to discover, browse, and edit dependencies across your entire workspace.

## Features

### 📦 Package Discovery
- Automatically finds all Swift packages (with `Package.swift`) and Xcode projects (`.xcodeproj`) in your workspace
- Recursively scans subdirectories (up to 5 levels deep)
- Displays packages in a tree view sidebar

### 🌳 Dependency Tree View
- Browse all packages and their dependencies in the Explorer sidebar
- See dependency type (local path or remote URL with version strategy)
- Click any dependency to edit it

### 🔄 Switch Sources
- Toggle dependencies between local paths and remote URLs with one click
- Auto-fills remote URLs from a configurable mapping (`dependency-urls.json`)
- Preserves all surrounding content in `Package.swift` files

### 📝 Edit Version Pinning
- Change version strategies: up-to-next-major, up-to-next-minor, exact, branch, revision
- Edit remote URLs
- Edit local paths

### 🔍 Bulk Dependency Overview
- See all dependencies across all packages in one table
- Identify inconsistencies (same dependency with different versions across packages)
- Visual warnings for inconsistent dependencies

### ⚙️ Git Integration
- **Fetch All Remotes** — Run `git fetch --all` on every Swift package with progress tracking
- **Open Terminal** — Right-click any package to open a terminal in that directory

## Installation

1. Download the `.vsix` file from releases or build it yourself
2. Install via VS Code:
   ```bash
   code --install-extension swift-dependency-manager-0.0.1.vsix
   ```
3. Or drag the `.vsix` file into VS Code's Extensions panel

## Usage

### View Dependencies
1. Open a workspace containing Swift packages
2. Look for **"Swift Dependencies"** in the Explorer sidebar
3. Expand packages to see their dependencies

### Edit a Dependency
1. Click any dependency in the tree
2. Choose Local or Remote source type
3. Fill in the path (local) or URL + version strategy (remote)
4. Click Save

### Fetch All Packages
1. Click the **cloud download icon** in the Swift Dependencies toolbar
2. The extension runs `git fetch --all` on every package
3. Progress is shown in a notification

### Open Terminal
1. Hover over any package in the tree
2. Click the **terminal icon** that appears
3. A terminal opens in that package's directory

### View Inconsistencies
1. Click **"Show Dependency Overview"** in the Command Palette
2. See all dependencies grouped by name
3. Inconsistent entries are highlighted with a warning icon

## Configuration

### dependency-urls.json

Create or edit `dependency-urls.json` in the extension directory to map package names to their remote URLs. When you switch a local dependency to remote, the extension looks up the package name and auto-fills the URL.

Example:
```json
{
  "facore": "http://repo.internal.servicesintegration.me/fullcontrol/mobile/ios/fullarm/facore.git",
  "mobileioscore": "http://repo.internal.servicesintegration.me/fullcontrol/mobile/ios/mobileioscore.git",
  "alarm": "http://repo.internal.servicesintegration.me/fullcontrol/mobile/ios/fullarm/alarm.git"
}
```

## Building

### Prerequisites
- Node 20+
- npm

### Build Steps

```bash
./build.sh
```

Or manually:
```bash
npm install
npm run compile
npm run package -- --allow-missing-repository --no-yarn
```

The `.vsix` file will be created in the project root.

## Testing

```bash
npm test
```

Runs 41 tests across 11 test files:
- 21 unit tests for parser, serializer, discovery, and tree view
- 20 property-based tests validating correctness properties using fast-check

Tests require Node 18+ (uses vitest).

## Architecture

The extension is built with:
- **TypeScript** — Type-safe implementation
- **VS Code API** — Tree view, webview panels, commands, file watching
- **Regex-based parsing** — Extracts dependencies from `Package.swift` files without a full Swift parser
- **Property-based testing** — Validates correctness properties across all input combinations

### Key Components

- **PackageDiscoveryService** — Recursively scans workspace for packages
- **PackageSwiftParser** — Parses `Package.swift` files using regex
- **DependencySerializer** — Writes modified dependencies back to files
- **DependencyTreeProvider** — Renders the sidebar tree view
- **DependencyEditorPanel** — Webview for editing individual dependencies
- **OverviewPanel** — Webview for bulk dependency overview with inconsistency detection

## Correctness Properties

The extension validates 10 correctness properties:

1. **Round-trip parsing** — Parse → serialize → parse produces equivalent dependencies
2. **Package discovery** — Finds exactly the correct set of packages
3. **Alphabetical sorting** — Packages are sorted by name (case-insensitive)
4. **Unrecognized syntax** — Invalid declarations produce warnings
5. **Tree children count** — Tree children match dependency count
6. **Label formatting** — Labels contain type-appropriate information
7. **File preservation** — Non-dependency content is preserved during edits
8. **Whitespace validation** — Empty/whitespace-only inputs are rejected
9. **Grouping completeness** — All dependencies appear in exactly one group
10. **Inconsistency detection** — Differing versions/sources are flagged

## License

MIT

## Contributing

This is a spec-driven project built with property-based testing. All changes should:
1. Update the spec files (`.kiro/specs/swift-dependency-manager-extension/`)
2. Add or update property-based tests
3. Ensure all 41 tests pass

## Troubleshooting

### Extension doesn't appear in sidebar
- Reload VS Code (`Cmd+Shift+P` → "Developer: Reload Window")
- Check that you have a workspace open (not just a single file)

### Packages not discovered
- Ensure `Package.swift` files exist in your workspace
- Check that directories aren't in the skip list: `.build`, `.git`, `node_modules`, `Pods`, `build`
- The extension scans up to 5 levels deep

### Git fetch fails
- Ensure the packages are valid git repositories
- Check that you have git installed and configured
- Verify network connectivity to remote repositories
