#!/bin/bash
set -e

echo "🔧 Building Swift Dependency Manager Extension..."

# Ensure we're using Node 20+
if ! command -v nvm &> /dev/null; then
    echo "⚠️  nvm not found, using system node"
    NODE_CMD="node"
    NPM_CMD="npm"
else
    echo "📦 Loading nvm..."
    source ~/.nvm/nvm.sh
    NODE_CMD="nvm exec 20 node"
    NPM_CMD="nvm exec 20 npm"
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📥 Installing dependencies..."
    $NPM_CMD install
fi

# Compile TypeScript
echo "🔨 Compiling TypeScript..."
$NPM_CMD run compile

# Package extension
echo "📦 Packaging extension..."
$NPM_CMD run package -- --allow-missing-repository --no-yarn

echo "✅ Build complete!"
echo "📦 Extension packaged: swift-dependency-manager-0.0.1.vsix"
echo ""
echo "To install:"
echo "  code --install-extension swift-dependency-manager-0.0.1.vsix"
