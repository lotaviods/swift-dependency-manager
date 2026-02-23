import * as vscode from 'vscode';
import { SwiftPackage, Dependency } from './models';
import { formatDependencyLabel, getDependencyName } from './treeLabels';

interface PackageWithDeps {
  name: string;
  path: string;
  dependencies: Dependency[];
}

interface DependencyUsage {
  name: string;
  packages: Array<{ packageName: string; version: string }>;
}

/**
 * Webview panel that shows a bulk overview of all packages
 * and their dependencies, with reverse lookup capability.
 */
export class OverviewPanel {
  private panel: vscode.WebviewPanel | undefined;

  open(packages: SwiftPackage[]): void {
    if (this.panel) {
      this.panel.webview.html = this.getHtml(packages);
      this.panel.reveal();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'dependencyOverview',
      'Dependency Overview',
      vscode.ViewColumn.One,
      { enableScripts: true }
    );

    this.panel.webview.html = this.getHtml(packages);

    this.panel.webview.onDidReceiveMessage(message => {
      if (message.command === 'openTerminal') {
        const pkg = packages.find(p => p.name === message.packageName);
        if (pkg) {
          const terminal = vscode.window.createTerminal({
            name: pkg.name,
            cwd: pkg.path,
          });
          terminal.show();
        }
      }
    });

    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });
  }

  private getHtml(packages: SwiftPackage[]): string {
    const packageData = packages.map(p => ({
      name: p.name,
      path: p.path,
      dependencies: p.dependencies,
    }));

    const dependencyIndex = this.buildDependencyIndex(packageData);

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Dependency Overview</title>
  <style>
    * {
      box-sizing: border-box;
    }
    body {
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
      font-size: var(--vscode-font-size, 13px);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 20px;
      margin: 0;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
      border-bottom: 1px solid var(--vscode-widget-border, #333);
      padding-bottom: 12px;
    }
    h1 {
      margin: 0;
      font-size: 20px;
      font-weight: 600;
    }
    .tabs {
      display: flex;
      gap: 8px;
    }
    .tab-btn {
      padding: 6px 12px;
      border: none;
      background: transparent;
      color: var(--vscode-foreground);
      cursor: pointer;
      border-bottom: 2px solid transparent;
      font-size: 13px;
      transition: all 0.2s;
    }
    .tab-btn.active {
      border-bottom-color: var(--vscode-focusBorder, #007acc);
      color: var(--vscode-focusBorder, #007acc);
    }
    .tab-btn:hover {
      background: var(--vscode-editor-hoverHighlightBackground, rgba(255,255,255,0.1));
    }
    .tab-content {
      display: none;
    }
    .tab-content.active {
      display: block;
    }
    .empty-msg {
      color: var(--vscode-descriptionForeground);
      padding: 20px;
      text-align: center;
    }
    .package-card {
      background: var(--vscode-editor-inactiveSelectionBackground, #2a2d2e);
      border: 1px solid var(--vscode-widget-border, #333);
      border-radius: 6px;
      padding: 12px;
      margin-bottom: 12px;
      transition: all 0.2s;
    }
    .package-card:hover {
      border-color: var(--vscode-focusBorder, #007acc);
      background: var(--vscode-editor-selectionBackground, #094771);
    }
    .package-name {
      font-weight: 600;
      font-size: 14px;
      margin-bottom: 8px;
      color: var(--vscode-focusBorder, #007acc);
    }
    .package-path {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 8px;
      font-family: monospace;
    }
    .deps-list {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .dep-tag {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-widget-border, #333);
      border-radius: 4px;
      padding: 4px 8px;
      font-size: 12px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .dep-tag:hover {
      background: var(--vscode-editor-selectionBackground, #094771);
      border-color: var(--vscode-focusBorder, #007acc);
    }
    .dep-tag.local {
      border-left: 3px solid #4ec9b0;
    }
    .dep-tag.remote {
      border-left: 3px solid #ce9178;
    }
    .dep-count {
      display: inline-block;
      background: var(--vscode-focusBorder, #007acc);
      color: var(--vscode-editor-background);
      border-radius: 12px;
      padding: 2px 6px;
      font-size: 11px;
      font-weight: 600;
      margin-left: 6px;
    }
    .dependency-card {
      background: var(--vscode-editor-inactiveSelectionBackground, #2a2d2e);
      border: 1px solid var(--vscode-widget-border, #333);
      border-radius: 6px;
      padding: 12px;
      margin-bottom: 12px;
    }
    .dependency-name {
      font-weight: 600;
      font-size: 14px;
      margin-bottom: 8px;
      color: var(--vscode-focusBorder, #007acc);
    }
    .used-by {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 6px;
    }
    .package-list {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .pkg-badge {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-widget-border, #333);
      border-radius: 4px;
      padding: 4px 8px;
      font-size: 12px;
    }
    .terminal-btn {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-widget-border, #333);
      border-radius: 4px;
      padding: 4px 8px;
      font-size: 12px;
      color: var(--vscode-foreground);
      cursor: pointer;
      transition: all 0.2s;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .terminal-btn:hover {
      background: var(--vscode-editor-selectionBackground, #094771);
      border-color: var(--vscode-focusBorder, #007acc);
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>📦 Dependency Overview</h1>
    <div class="tabs">
      <button class="tab-btn active" onclick="switchTab('packages')">Packages</button>
      <button class="tab-btn" onclick="switchTab('dependencies')">Dependencies</button>
    </div>
  </div>

  <div id="packages" class="tab-content active">
    ${this.renderPackagesView(packageData)}
  </div>

  <div id="dependencies" class="tab-content">
    ${this.renderDependenciesView(dependencyIndex)}
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    
    function switchTab(tabName) {
      document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
      document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
      document.getElementById(tabName).classList.add('active');
      event.target.classList.add('active');
    }
  </script>
</body>
</html>`;
  }

  private renderPackagesView(packages: PackageWithDeps[]): string {
    if (packages.length === 0) {
      return '<p class="empty-msg">No packages found.</p>';
    }

    const packagesWithDeps = packages.filter(pkg => pkg.dependencies.length > 0);

    if (packagesWithDeps.length === 0) {
      return '<p class="empty-msg">No packages with dependencies found.</p>';
    }

    return packagesWithDeps
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(pkg => {
        const depCount = pkg.dependencies.length;
        const depsHtml = pkg.dependencies
          .map(dep => {
            const source = dep.type === 'local' ? 'local' : 'remote';
            const depName = getDependencyName(dep);
            const detail = dep.type === 'local' 
              ? dep.path 
              : formatDependencyLabel(dep);
            return `<span class="dep-tag ${source}" title="${escapeHtml(depName)}: ${escapeHtml(detail)}">${escapeHtml(depName)} <span style="opacity: 0.7; font-size: 11px;">${escapeHtml(detail)}</span></span>`;
          })
          .join('');

        return `
          <div class="package-card">
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
              <div style="flex: 1;">
                <div class="package-name">
                  ${escapeHtml(pkg.name)}
                  <span class="dep-count">${depCount}</span>
                </div>
                <div class="package-path">${escapeHtml(pkg.path)}</div>
              </div>
              <button class="terminal-btn" onclick="vscode.postMessage({command: 'openTerminal', packageName: '${escapeHtml(pkg.name)}'})">
                ▶ Terminal
              </button>
            </div>
            <div class="deps-list" style="margin-top: 8px;">${depsHtml}</div>
          </div>
        `;
      })
      .join('');
  }

  private renderDependenciesView(index: Map<string, Array<{ packageName: string; version: string }>>): string {
    if (index.size === 0) {
      return '<p class="empty-msg">No dependencies found.</p>';
    }

    const sorted = Array.from(index.entries()).sort((a, b) => a[0].localeCompare(b[0]));

    return sorted
      .map(([depName, usages]) => {
        const pkgBadges = usages
          .map(usage => `<span class="pkg-badge">${escapeHtml(usage.packageName)} <span style="opacity: 0.7; font-size: 11px;">${escapeHtml(usage.version)}</span></span>`)
          .join('');

        return `
          <div class="dependency-card">
            <div class="dependency-name">${escapeHtml(depName)}</div>
            <div class="used-by">Used by ${usages.length} package${usages.length !== 1 ? 's' : ''}</div>
            <div class="package-list">${pkgBadges}</div>
          </div>
        `;
      })
      .join('');
  }

  private buildDependencyIndex(packages: PackageWithDeps[]): Map<string, Array<{ packageName: string; version: string }>> {
    const index = new Map<string, Array<{ packageName: string; version: string }>>();

    for (const pkg of packages) {
      for (const dep of pkg.dependencies) {
        const depName = getDependencyName(dep);
        const version = dep.type === 'local' 
          ? dep.path 
          : formatDependencyLabel(dep);
        
        if (!index.has(depName)) {
          index.set(depName, []);
        }
        index.get(depName)!.push({ packageName: pkg.name, version });
      }
    }

    return index;
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
