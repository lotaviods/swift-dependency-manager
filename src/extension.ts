import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as child_process from 'child_process';
import { Dependency, SwiftPackage, VersionRequirement } from './models';
import { DependencyTreeProvider } from './treeProvider';
import { DependencyEditorPanel } from './editorPanel';
import { OverviewPanel } from './overviewPanel';
import { discoverPackages, createPackageWatcher } from './discoveryService';
import { computeReplacements } from './bulkUpdate';
import { groupDependenciesByName } from './grouping';
import { replaceDependencyInFile } from './serializer';
import { parsePackageSwift } from './parser';
import { getDependencyName } from './treeLabels';

export function activate(context: vscode.ExtensionContext) {
  console.log('Swift Dependency Manager is now active.');

  const treeProvider = new DependencyTreeProvider();

  const treeView = vscode.window.createTreeView('swiftDependencies', {
    treeDataProvider: treeProvider,
  });
  context.subscriptions.push(treeView);

  // Initial discovery
  async function refreshPackages() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      treeProvider.setPackages([]);
      return;
    }
    const packages = await discoverPackages(workspaceFolders[0].uri.fsPath);
    treeProvider.setPackages(packages);
  }

  refreshPackages();

  // Editor panel — refreshes the tree after a successful save
  const editorPanel = new DependencyEditorPanel(() => refreshPackages());

  // Overview panel
  const overviewPanel = new OverviewPanel();

  // Register refresh command
  context.subscriptions.push(
    vscode.commands.registerCommand('swiftDependencyManager.refreshDependencies', refreshPackages)
  );

  // Register edit dependency command (triggered by clicking a dependency node)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'swiftDependencyManager.editDependency',
      (dep: Dependency, parentPackage: SwiftPackage) => {
        editorPanel.open(dep, parentPackage);
      }
    )
  );

  // Register show dependency overview command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'swiftDependencyManager.showDependencyOverview',
      () => {
        overviewPanel.open(treeProvider.getPackages());
      }
    )
  );

  // Register fetch all remotes command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'swiftDependencyManager.fetchAllRemotes',
      async () => {
        await fetchAllGitRemotes(treeProvider.getPackages());
      }
    )
  );

  // Register open terminal command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'swiftDependencyManager.openTerminal',
      (item: { type: string; package: SwiftPackage }) => {
        if (item.type === 'package') {
          const terminal = vscode.window.createTerminal({
            name: `${item.package.name}`,
            cwd: item.package.path,
          });
          terminal.show();
        }
      }
    )
  );

  // Register bulk update dependency command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'swiftDependencyManager.bulkUpdateDependency',
      async () => {
        const packages = treeProvider.getPackages();
        const groups = groupDependenciesByName(packages);

        if (groups.length === 0) {
          vscode.window.showInformationMessage('No dependencies found.');
          return;
        }

        // Step 1: Pick dependency name
        const depName = await vscode.window.showQuickPick(
          groups.map(g => g.name),
          { placeHolder: 'Select a dependency to update across all packages' }
        );
        if (!depName) { return; }

        // Step 2: Pick source type
        const sourceType = await vscode.window.showQuickPick(
          ['Remote', 'Local'],
          { placeHolder: 'Select the new source type' }
        );
        if (!sourceType) { return; }

        let newDependency: Dependency;

        if (sourceType === 'Local') {
          // Prompt for local path
          const localPath = await vscode.window.showInputBox({
            prompt: 'Enter the local filesystem path',
            placeHolder: '../MyPackage',
            validateInput: (v) => (!v || !v.trim()) ? 'Path cannot be empty' : undefined,
          });
          if (!localPath) { return; }

          newDependency = {
            type: 'local',
            path: localPath,
            rawDeclaration: '',
            declarationRange: { start: 0, end: 0 },
          };
        } else {
          // Load URL mappings and pre-fill if available
          let defaultUrl = '';
          try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (workspaceFolders && workspaceFolders.length > 0) {
              const configPath = path.join(workspaceFolders[0].uri.fsPath, 'dependency-urls.json');
              if (fs.existsSync(configPath)) {
                const configContent = fs.readFileSync(configPath, 'utf-8');
                const urlMappings: Record<string, string> = JSON.parse(configContent);
                if (urlMappings[depName]) {
                  defaultUrl = urlMappings[depName];
                }
              }
            }
          } catch {
            // Config not found, no pre-fill
          }

          // Prompt for remote URL
          const url = await vscode.window.showInputBox({
            prompt: 'Enter the remote URL',
            placeHolder: 'https://github.com/org/repo.git',
            value: defaultUrl,
            validateInput: (v) => (!v || !v.trim()) ? 'URL cannot be empty' : undefined,
          });
          if (!url) { return; }

          // Pick version strategy
          const strategies = [
            { label: 'upToNextMajor', description: 'Up to next major version' },
            { label: 'upToNextMinor', description: 'Up to next minor version' },
            { label: 'from', description: 'From version' },
            { label: 'exact', description: 'Exact version' },
            { label: 'branch', description: 'Branch name' },
            { label: 'revision', description: 'Revision hash' },
          ];
          const strategy = await vscode.window.showQuickPick(strategies, {
            placeHolder: 'Select version requirement strategy',
          });
          if (!strategy) { return; }

          let versionRequirement: VersionRequirement;

          if (strategy.label === 'branch') {
            const name = await vscode.window.showInputBox({
              prompt: 'Enter the branch name',
              placeHolder: 'main',
              validateInput: (v) => (!v || !v.trim()) ? 'Branch name cannot be empty' : undefined,
            });
            if (!name) { return; }
            versionRequirement = { type: 'branch', name };
          } else if (strategy.label === 'revision') {
            const hash = await vscode.window.showInputBox({
              prompt: 'Enter the revision hash',
              placeHolder: 'abc123...',
              validateInput: (v) => (!v || !v.trim()) ? 'Revision hash cannot be empty' : undefined,
            });
            if (!hash) { return; }
            versionRequirement = { type: 'revision', hash };
          } else {
            const version = await vscode.window.showInputBox({
              prompt: 'Enter the version',
              placeHolder: '1.0.0',
              validateInput: (v) => (!v || !v.trim()) ? 'Version cannot be empty' : undefined,
            });
            if (!version) { return; }
            versionRequirement = { type: strategy.label as 'upToNextMajor' | 'upToNextMinor' | 'from' | 'exact', version };
          }

          newDependency = {
            type: 'remote',
            url,
            versionRequirement,
            rawDeclaration: '',
            declarationRange: { start: 0, end: 0 },
          };
        }

        // Compute replacements
        const operations = computeReplacements(depName, newDependency, packages);

        if (operations.length === 0) {
          vscode.window.showInformationMessage('No occurrences found.');
          return;
        }

        // Apply replacements, re-parsing when multiple ops target the same file
        let successCount = 0;
        const failures: Array<{ filePath: string; error: string }> = [];

        // Group operations by file path to handle re-parsing
        const opsByFile = new Map<string, typeof operations>();
        for (const op of operations) {
          let list = opsByFile.get(op.filePath);
          if (!list) {
            list = [];
            opsByFile.set(op.filePath, list);
          }
          list.push(op);
        }

        for (const [filePath, fileOps] of opsByFile) {
          for (let i = 0; i < fileOps.length; i++) {
            try {
              let currentOp = fileOps[i];

              // Re-parse the file if this isn't the first operation on this file
              if (i > 0) {
                const parseResult = await parsePackageSwift(filePath);
                const updatedDep = parseResult.dependencies.find(
                  d => getDependencyName(d) === depName
                );
                if (!updatedDep) {
                  failures.push({ filePath, error: 'Could not find dependency after re-parse' });
                  continue;
                }
                currentOp = { ...currentOp, oldDependency: updatedDep };
              }

              await replaceDependencyInFile(currentOp.filePath, currentOp.oldDependency, newDependency);
              successCount++;
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              failures.push({ filePath, error: message });
            }
          }
        }

        // Refresh tree view
        await refreshPackages();

        // Show summary
        if (failures.length === 0) {
          vscode.window.showInformationMessage(`Updated ${depName} in ${successCount} package(s).`);
        } else {
          vscode.window.showWarningMessage(
            `Updated ${depName} in ${successCount} package(s), ${failures.length} failed.`
          );
        }
      }
    )
  );

  // Watch for Package.swift changes
  const { onDidChangePackages, dispose: disposeWatcher } = createPackageWatcher(vscode.workspace);
  onDidChangePackages(() => refreshPackages());
  context.subscriptions.push({ dispose: disposeWatcher });
}

export function deactivate() {}

/**
 * Fetch git remotes for all Swift packages in the workspace.
 */
async function fetchAllGitRemotes(packages: SwiftPackage[]): Promise<void> {
  if (packages.length === 0) {
    vscode.window.showInformationMessage('No Swift packages found.');
    return;
  }

  const total = packages.length;
  let completed = 0;
  let failed = 0;

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Fetching git remotes',
      cancellable: false,
    },
    async (progress) => {
      for (const pkg of packages) {
        progress.report({ message: `${pkg.name} (${completed + 1}/${total})` });

        try {
          await new Promise<void>((resolve, reject) => {
            child_process.exec(
              'git fetch --all',
              { cwd: pkg.path, timeout: 30000 },
              (error, stdout, stderr) => {
                if (error) {
                  console.error(`Failed to fetch ${pkg.name}:`, stderr);
                  failed++;
                  reject(error);
                } else {
                  resolve();
                }
              }
            );
          });
        } catch {
          // Continue even if one fails
        }

        completed++;
      }
    }
  );

  if (failed === 0) {
    vscode.window.showInformationMessage(`✅ Fetched ${total} Swift packages.`);
  } else {
    vscode.window.showWarningMessage(
      `⚠️ Fetched ${completed - failed}/${total} packages (${failed} failed).`
    );
  }
}
