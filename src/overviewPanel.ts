import * as vscode from 'vscode';
import { SwiftPackage } from './models';
import { groupDependenciesByName, DependencyGroup } from './grouping';
import { formatDependencyLabel } from './treeLabels';

/**
 * Webview panel that shows a bulk overview of all dependencies
 * across all discovered Swift packages, grouped by dependency name.
 */
export class OverviewPanel {
  private panel: vscode.WebviewPanel | undefined;

  open(packages: SwiftPackage[]): void {
    const groups = groupDependenciesByName(packages);

    if (this.panel) {
      this.panel.webview.html = this.getHtml(groups);
      this.panel.reveal();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'dependencyOverview',
      'Dependency Overview',
      vscode.ViewColumn.One,
      { enableScripts: false }
    );

    this.panel.webview.html = this.getHtml(groups);

    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });
  }

  private getHtml(groups: DependencyGroup[]): string {
    const rows = groups.map(g => this.renderGroup(g)).join('');

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Dependency Overview</title>
  <style>
    body {
      font-family: var(--vscode-font-family, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 16px;
      margin: 0;
    }
    h2 { margin-top: 0; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 12px;
    }
    th, td {
      text-align: left;
      padding: 6px 10px;
      border-bottom: 1px solid var(--vscode-widget-border, #333);
    }
    th {
      background: var(--vscode-editor-inactiveSelectionBackground, #2a2d2e);
      font-weight: 600;
    }
    .group-header td {
      font-weight: 600;
      background: var(--vscode-editor-inactiveSelectionBackground, #2a2d2e);
    }
    .inconsistent td {
      color: var(--vscode-editorWarning-foreground, #cca700);
    }
    .warning-icon::before {
      content: "⚠ ";
    }
    .empty-msg {
      color: var(--vscode-descriptionForeground);
      margin-top: 12px;
    }
  </style>
</head>
<body>
  <h2>Dependency Overview</h2>
  ${groups.length === 0
    ? '<p class="empty-msg">No dependencies found across packages.</p>'
    : `<table>
    <thead>
      <tr><th>Dependency</th><th>Package</th><th>Source</th><th>Version / Path</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`}
</body>
</html>`;
  }

  private renderGroup(group: DependencyGroup): string {
    return group.entries.map((entry, i) => {
      const dep = entry.dependency;
      const rowClass = group.isInconsistent ? ' class="inconsistent"' : '';
      const nameCell = i === 0
        ? `<td rowspan="${group.entries.length}">${group.isInconsistent ? '<span class="warning-icon"></span>' : ''}${escapeHtml(group.name)}</td>`
        : '';
      const source = dep.type === 'local' ? 'Local' : 'Remote';
      const detail = dep.type === 'local'
        ? escapeHtml(dep.path)
        : escapeHtml(formatDependencyLabel(dep));

      return `<tr${rowClass}>${nameCell}<td>${escapeHtml(entry.packageName)}</td><td>${source}</td><td>${detail}</td></tr>`;
    }).join('');
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
