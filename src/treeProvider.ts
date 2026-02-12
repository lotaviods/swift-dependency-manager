import * as vscode from 'vscode';
import { SwiftPackage } from './models';
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

export type DependencyTreeItem = PackageTreeItem | DependencyChildItem;

// --- TreeDataProvider implementation ---

export class DependencyTreeProvider implements vscode.TreeDataProvider<DependencyTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<DependencyTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private packages: SwiftPackage[] = [];

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
      const item = new vscode.TreeItem(
        element.package.name,
        element.package.dependencies.length > 0
          ? vscode.TreeItemCollapsibleState.Collapsed
          : vscode.TreeItemCollapsibleState.None
      );
      item.contextValue = 'package';
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

  getChildren(element?: DependencyTreeItem): DependencyTreeItem[] {
    if (!element) {
      // Root level: return package nodes
      return this.packages.map(pkg => ({
        type: 'package' as const,
        package: pkg,
      }));
    }

    if (element.type === 'package') {
      // Package level: return dependency child nodes
      return element.package.dependencies.map(dep => ({
        type: 'dependency' as const,
        dependency: dep,
        parentPackage: element.package,
      }));
    }

    // Dependency nodes have no children
    return [];
  }
}
