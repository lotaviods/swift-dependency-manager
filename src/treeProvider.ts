import * as vscode from 'vscode';
import { SwiftPackage } from './models';
import { BranchInfo, ExecCommand, listBranches } from './gitService';
import { formatDependencyLabel, getDependencyName } from './treeLabels';

// Re-export pure functions and types for convenience
export { formatVersionRequirement, formatDependencyLabel, getDependencyName } from './treeLabels';

// --- Tree item types ---

export interface PackageTreeItem {
  type: 'package';
  package: SwiftPackage;
}

export interface DependencyChildItem {
  type: 'dependency';
  dependency: import('./models').Dependency;
  parentPackage: SwiftPackage;
}

export interface BranchGroupItem {
  type: 'branchGroup';
  parentPackage: SwiftPackage;
}

export interface BranchTreeItem {
  type: 'branch';
  branch: BranchInfo;
  parentPackage: SwiftPackage;
}

export type DependencyTreeItem = PackageTreeItem | DependencyChildItem | BranchGroupItem | BranchTreeItem;

// --- TreeDataProvider implementation ---

export class DependencyTreeProvider implements vscode.TreeDataProvider<DependencyTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<DependencyTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private packages: SwiftPackage[] = [];
  private exec: ExecCommand | undefined;

  setExec(exec: ExecCommand): void {
    this.exec = exec;
  }

  setPackages(packages: SwiftPackage[]): void {
    this.packages = packages;
    this._onDidChangeTreeData.fire();
  }

  getPackages(): SwiftPackage[] {
    return this.packages;
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: DependencyTreeItem): vscode.TreeItem {
    if (element.type === 'package') {
      const pkg = element.package;
      const item = new vscode.TreeItem(
        pkg.name,
        vscode.TreeItemCollapsibleState.Collapsed
      );
      item.contextValue = 'package';
      if (pkg.isSubmodule) {
        item.iconPath = new vscode.ThemeIcon('git-submodule');
        if (pkg.isEmptySubmodule) {
          item.description = '(not initialized)';
        }
      }
      return item;
    }

    if (element.type === 'branchGroup') {
      const item = new vscode.TreeItem('Branches', vscode.TreeItemCollapsibleState.Collapsed);
      item.iconPath = new vscode.ThemeIcon('git-branch');
      item.contextValue = 'branchGroup';
      return item;
    }

    if (element.type === 'branch') {
      const item = new vscode.TreeItem(element.branch.name, vscode.TreeItemCollapsibleState.None);
      item.contextValue = element.branch.isCurrent ? 'activeBranch' : 'branch';
      item.iconPath = new vscode.ThemeIcon(element.branch.isCurrent ? 'check' : 'git-branch');
      if (element.branch.isRemote) {
        item.description = '(remote)';
      }
      if (element.branch.isCurrent) {
        item.description = (item.description ? item.description + ' ' : '') + '● current';
      }
      return item;
    }

    // Dependency child item
    const name = getDependencyName(element.dependency);
    const label = formatDependencyLabel(element.dependency);
    const item = new vscode.TreeItem(`${name} (${label})`, vscode.TreeItemCollapsibleState.None);
    item.contextValue = 'dependency';
    item.command = {
      command: 'swiftDependencyManager.editDependency',
      title: 'Edit Dependency',
      arguments: [element.dependency, element.parentPackage],
    };
    return item;
  }

  async getChildren(element?: DependencyTreeItem): Promise<DependencyTreeItem[]> {
    if (!element) {
      return this.packages.map(pkg => ({
        type: 'package' as const,
        package: pkg,
      }));
    }

    if (element.type === 'package') {
      const items: DependencyTreeItem[] = [];

      // Dependencies first
      for (const dep of element.package.dependencies) {
        items.push({
          type: 'dependency' as const,
          dependency: dep,
          parentPackage: element.package,
        });
      }

      // Then a "Branches" group node
      items.push({
        type: 'branchGroup' as const,
        parentPackage: element.package,
      });

      return items;
    }

    if (element.type === 'branchGroup') {
      if (!this.exec) { return []; }
      const result = await listBranches(element.parentPackage.path, this.exec);
      return result.branches.map(branch => ({
        type: 'branch' as const,
        branch,
        parentPackage: element.parentPackage,
      }));
    }

    return [];
  }
}
