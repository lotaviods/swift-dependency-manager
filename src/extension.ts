import * as vscode from 'vscode';
import * as child_process from 'child_process';
import { Dependency, SwiftPackage } from './models';
import { DependencyTreeProvider } from './treeProvider';
import { DependencyEditorPanel } from './editorPanel';
import { OverviewPanel } from './overviewPanel';
import { discoverPackages, createPackageWatcher } from './discoveryService';

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
