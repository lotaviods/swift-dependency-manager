import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Dependency, SwiftPackage, RemoteDependency, LocalDependency } from './models';
import { validateNonEmpty } from './validator';
import { replaceDependencyInFile } from './serializer';
import { parsePackageSwift } from './parser';
import { getDependencyName } from './treeLabels';

// Load dependency URL mappings from JSON config
function loadUrlMappings(): Record<string, string> {
  try {
    // Try workspace root first
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
      const configPath = path.join(workspaceFolders[0].uri.fsPath, 'dependency-urls.json');
      if (fs.existsSync(configPath)) {
        const configContent = fs.readFileSync(configPath, 'utf-8');
        return JSON.parse(configContent);
      }
    }
  } catch (err) {
    console.error('Failed to load dependency-urls.json:', err);
  }
  return {};
}

let urlMappings: Record<string, string> = loadUrlMappings();

/**
 * Manages a webview panel for editing a single dependency.
 * Handles rendering the HTML form and message passing between
 * the webview and the extension host.
 */
export class DependencyEditorPanel {
  private panel: vscode.WebviewPanel | undefined;
  private onDidSave: (() => void) | undefined;

  /**
   * @param onDidSave - Callback invoked after a successful save so the caller can refresh the tree.
   */
  constructor(onDidSave?: () => void) {
    this.onDidSave = onDidSave;
  }

  /**
   * Open (or reveal) the editor panel for a specific dependency.
   */
  open(dep: Dependency, parentPackage: SwiftPackage): void {
    if (this.panel) {
      this.panel.dispose();
    }

    const name = getDependencyName(dep);

    this.panel = vscode.window.createWebviewPanel(
      'dependencyEditor',
      `Edit: ${name}`,
      vscode.ViewColumn.One,
      { enableScripts: true }
    );

    this.panel.webview.html = this.getHtml(dep);

    this.panel.webview.onDidReceiveMessage(async (msg) => {
      await this.handleMessage(msg, dep, parentPackage);
    });

    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });
  }

  /**
   * Handle messages from the webview.
   */
  private async handleMessage(
    msg: { command: string; [key: string]: unknown },
    oldDep: Dependency,
    parentPackage: SwiftPackage
  ): Promise<void> {
    if (msg.command === 'cancel') {
      this.panel?.dispose();
      return;
    }

    if (msg.command === 'save') {
      const sourceType = msg.sourceType as string;
      const errors: Record<string, string> = {};

      let newDep: Dependency;

      if (sourceType === 'local') {
        const pathValue = (msg.path as string) ?? '';
        const pathError = validateNonEmpty(pathValue);
        if (pathError) {
          errors.path = pathError;
        }
        if (Object.keys(errors).length > 0) {
          this.panel?.webview.postMessage({ command: 'validationErrors', errors });
          return;
        }
        newDep = {
          type: 'local',
          path: pathValue,
          rawDeclaration: '',
          declarationRange: { start: 0, end: 0 },
        } as LocalDependency;
      } else {
        const url = (msg.url as string) ?? '';
        const strategy = (msg.strategy as string) ?? '';
        const value = (msg.value as string) ?? '';

        const urlError = validateNonEmpty(url);
        if (urlError) {
          errors.url = urlError;
        }
        const valueError = validateNonEmpty(value);
        if (valueError) {
          errors.value = valueError;
        }
        if (Object.keys(errors).length > 0) {
          this.panel?.webview.postMessage({ command: 'validationErrors', errors });
          return;
        }

        const vr = buildVersionRequirement(strategy, value);
        newDep = {
          type: 'remote',
          url,
          versionRequirement: vr,
          rawDeclaration: '',
          declarationRange: { start: 0, end: 0 },
        } as RemoteDependency;
      }

      try {
        await replaceDependencyInFile(parentPackage.manifestPath, oldDep, newDep);

        // Re-parse to get updated dependency data
        const result = await parsePackageSwift(parentPackage.manifestPath);
        parentPackage.dependencies = result.dependencies;

        this.panel?.dispose();

        if (this.onDidSave) {
          this.onDidSave();
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Failed to update dependency: ${message}`);
      }
    }
  }

  /**
   * Generate the HTML content for the webview form.
   */
  private getHtml(dep: Dependency): string {
    const isLocal = dep.type === 'local';
    const url = dep.type === 'remote' ? dep.url : '';
    const strategy = dep.type === 'remote' ? dep.versionRequirement.type : 'upToNextMajor';
    const versionValue = dep.type === 'remote' ? getVersionValue(dep.versionRequirement) : '';
    const pathValue = dep.type === 'local' ? dep.path : '';
    
    // Pass dependency data to webview for URL inference
    const depData = JSON.stringify({
      isLocal,
      path: pathValue,
      url,
      urlMappings,
    });

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Edit Dependency</title>
  <style>
    body {
      font-family: var(--vscode-font-family, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 16px;
      margin: 0;
    }
    .field { margin-bottom: 12px; }
    label { display: block; margin-bottom: 4px; font-weight: 600; }
    input[type="text"], select {
      width: 100%;
      box-sizing: border-box;
      padding: 6px 8px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, transparent);
      border-radius: 2px;
    }
    .radio-group { display: flex; gap: 16px; margin-bottom: 12px; }
    .radio-group label { font-weight: normal; display: flex; align-items: center; gap: 4px; }
    .error {
      color: var(--vscode-errorForeground, #f44);
      font-size: 12px;
      margin-top: 2px;
      display: none;
    }
    .buttons { margin-top: 16px; display: flex; gap: 8px; }
    button {
      padding: 6px 14px;
      border: none;
      border-radius: 2px;
      cursor: pointer;
      font-size: 13px;
    }
    button.primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    button.primary:hover { background: var(--vscode-button-hoverBackground); }
    button.secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
  </style>
</head>
<body>
  <h3>Edit Dependency</h3>

  <div class="field">
    <label>Source Type</label>
    <div class="radio-group">
      <label><input type="radio" name="sourceType" value="local" ${isLocal ? 'checked' : ''} /> Local</label>
      <label><input type="radio" name="sourceType" value="remote" ${!isLocal ? 'checked' : ''} /> Remote</label>
    </div>
  </div>

  <div id="localFields" style="display:${isLocal ? 'block' : 'none'}">
    <div class="field">
      <label for="pathInput">Path</label>
      <input type="text" id="pathInput" value="${escapeHtml(pathValue)}" />
      <div class="error" id="pathError"></div>
    </div>
  </div>

  <div id="remoteFields" style="display:${!isLocal ? 'block' : 'none'}">
    <div class="field">
      <label for="urlInput">URL</label>
      <div style="display: flex; gap: 8px; align-items: flex-start;">
        <input type="text" id="urlInput" value="${escapeHtml(url)}" style="flex: 1;" />
        <button type="button" id="resetUrlBtn" class="secondary" style="padding: 6px 10px; margin-top: 0; display: none; white-space: nowrap;">Reset URL</button>
      </div>
      <div class="error" id="urlError"></div>
      <div id="urlAppliedIndicator" style="display: none; color: var(--vscode-charts-green, #4caf50); font-size: 12px; margin-top: 4px;">
        ✓ URL from dependency-urls.json applied
      </div>
    </div>
    <div class="field">
      <label for="strategySelect">Version Strategy</label>
      <select id="strategySelect">
        <option value="upToNextMajor" ${strategy === 'upToNextMajor' ? 'selected' : ''}>Up to Next Major</option>
        <option value="upToNextMinor" ${strategy === 'upToNextMinor' ? 'selected' : ''}>Up to Next Minor</option>
        <option value="from" ${strategy === 'from' ? 'selected' : ''}>From</option>
        <option value="exact" ${strategy === 'exact' ? 'selected' : ''}>Exact</option>
        <option value="branch" ${strategy === 'branch' ? 'selected' : ''}>Branch</option>
        <option value="revision" ${strategy === 'revision' ? 'selected' : ''}>Revision</option>
      </select>
    </div>
    <div class="field">
      <label for="valueInput">Version / Branch / Revision</label>
      <input type="text" id="valueInput" value="${escapeHtml(versionValue)}" />
      <div class="error" id="valueError"></div>
    </div>
  </div>

  <div class="buttons">
    <button class="primary" id="saveBtn">Save</button>
    <button class="secondary" id="cancelBtn">Cancel</button>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const depData = ${depData};

    const radios = document.querySelectorAll('input[name="sourceType"]');
    const localFields = document.getElementById('localFields');
    const remoteFields = document.getElementById('remoteFields');
    const urlInput = document.getElementById('urlInput');
    const resetUrlBtn = document.getElementById('resetUrlBtn');
    const urlAppliedIndicator = document.getElementById('urlAppliedIndicator');

    // Check if there's a predefined URL and show/hide reset button accordingly
    function updateResetButtonVisibility() {
      const currentUrl = urlInput.value;
      const packageName = extractPackageNameFromUrl(currentUrl);
      const predefinedUrl = lookupPredefinedUrl(packageName);
      
      if (predefinedUrl && currentUrl !== predefinedUrl) {
        resetUrlBtn.style.display = 'inline-block';
        resetUrlBtn.title = \`Reset to: \${predefinedUrl}\`;
        urlAppliedIndicator.style.display = 'none';
      } else if (predefinedUrl && currentUrl === predefinedUrl) {
        resetUrlBtn.style.display = 'none';
        urlAppliedIndicator.style.display = 'block';
      } else {
        resetUrlBtn.style.display = 'none';
        urlAppliedIndicator.style.display = 'none';
      }
    }

    // Extract package name from URL (last part before .git)
    function extractPackageNameFromUrl(url) {
      if (!url) return '';
      const match = url.match(/\\/([^\\/]+?)(\\.git)?$/);
      return match ? match[1] : '';
    }

    // Look up predefined URL by package name
    function lookupPredefinedUrl(name) {
      if (!name) return '';
      const nameLower = name.toLowerCase();
      for (const [key, value] of Object.entries(depData.urlMappings)) {
        if (key.toLowerCase() === nameLower) {
          return value;
        }
      }
      return '';
    }

    // Reset URL to predefined value
    resetUrlBtn.addEventListener('click', () => {
      const currentUrl = urlInput.value;
      const packageName = extractPackageNameFromUrl(currentUrl);
      const predefinedUrl = lookupPredefinedUrl(packageName);
      if (predefinedUrl) {
        urlInput.value = predefinedUrl;
        updateResetButtonVisibility();
      }
    });

    // Update reset button visibility when URL changes
    urlInput.addEventListener('input', updateResetButtonVisibility);

    radios.forEach(r => r.addEventListener('change', () => {
      const isLocal = document.querySelector('input[name="sourceType"]:checked').value === 'local';
      localFields.style.display = isLocal ? 'block' : 'none';
      remoteFields.style.display = isLocal ? 'none' : 'block';
      
      // When switching from local to remote, try to infer URL from path
      if (!isLocal && depData.isLocal && !urlInput.value) {
        const inferredUrl = inferUrlFromPath(depData.path);
        if (inferredUrl) {
          urlInput.value = inferredUrl;
          updateResetButtonVisibility();
        }
      }
      
      clearErrors();
    }));
    
    // Try to infer a remote URL from a local path
    function inferUrlFromPath(path) {
      if (!path) return '';
      
      // Extract the last path component (package name)
      const parts = path.replace(/\\/+$/, '').split('/');
      const name = parts[parts.length - 1];
      if (!name) return '';
      
      // Check if there's already a remote URL in the data (from a previous remote state)
      if (depData.url) {
        return depData.url;
      }
      
      // Look up in the URL mappings (case-insensitive)
      const nameLower = name.toLowerCase();
      for (const [key, value] of Object.entries(depData.urlMappings)) {
        if (key.toLowerCase() === nameLower) {
          return value;
        }
      }
      
      // Fallback: default pattern
      return \`http://repo.internal.servicesintegration.me/fullcontrol/mobile/ios/fullarm/\${name}.git\`;
    }

    document.getElementById('saveBtn').addEventListener('click', () => {
      clearErrors();
      const sourceType = document.querySelector('input[name="sourceType"]:checked').value;
      if (sourceType === 'local') {
        vscode.postMessage({
          command: 'save',
          sourceType: 'local',
          path: document.getElementById('pathInput').value
        });
      } else {
        vscode.postMessage({
          command: 'save',
          sourceType: 'remote',
          url: document.getElementById('urlInput').value,
          strategy: document.getElementById('strategySelect').value,
          value: document.getElementById('valueInput').value
        });
      }
    });

    document.getElementById('cancelBtn').addEventListener('click', () => {
      vscode.postMessage({ command: 'cancel' });
    });

    window.addEventListener('message', event => {
      const msg = event.data;
      if (msg.command === 'validationErrors') {
        const errors = msg.errors;
        if (errors.path) { showError('pathError', errors.path); }
        if (errors.url) { showError('urlError', errors.url); }
        if (errors.value) { showError('valueError', errors.value); }
      }
    });

    function showError(id, text) {
      const el = document.getElementById(id);
      if (el) { el.textContent = text; el.style.display = 'block'; }
    }

    function clearErrors() {
      document.querySelectorAll('.error').forEach(el => {
        el.textContent = '';
        el.style.display = 'none';
      });
    }

    // Initialize reset button visibility on load
    updateResetButtonVisibility();
  </script>
</body>
</html>`;
  }
}

/** Extract the display value from a VersionRequirement. */
function getVersionValue(vr: import('./models').VersionRequirement): string {
  switch (vr.type) {
    case 'upToNextMajor':
    case 'upToNextMinor':
    case 'from':
    case 'exact':
      return vr.version;
    case 'branch':
      return vr.name;
    case 'revision':
      return vr.hash;
  }
}

/** Build a VersionRequirement from the strategy name and value string. */
function buildVersionRequirement(strategy: string, value: string): import('./models').VersionRequirement {
  switch (strategy) {
    case 'upToNextMajor':
      return { type: 'upToNextMajor', version: value };
    case 'upToNextMinor':
      return { type: 'upToNextMinor', version: value };
    case 'from':
      return { type: 'from', version: value };
    case 'exact':
      return { type: 'exact', version: value };
    case 'branch':
      return { type: 'branch', name: value };
    case 'revision':
      return { type: 'revision', hash: value };
    default:
      return { type: 'from', version: value };
  }
}

/** Escape HTML special characters for safe embedding in attribute values. */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
