#!/bin/bash
set -e

echo "🔧 Building Swift Dependency Manager Extension..."

# Check Node version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Error: Node 18+ is required (you have v$NODE_VERSION)"
    echo ""
    echo "Install Node 20 with Homebrew:"
    echo "  brew install node@20"
    echo ""
    echo "Or use nvm:"
    echo "  nvm install 20"
    echo "  nvm use 20"
    exit 1
fi

echo "✅ Node version: $(node -v)"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📥 Installing dependencies..."
    npm install
fi

# Compile TypeScript
echo "🔨 Compiling TypeScript..."
npm run compile

# Package extension
echo "📦 Packaging extension..."
npm run package -- --allow-missing-repository --no-yarn

echo "✅ Build complete!"
echo "📦 Extension packaged: swift-dependency-manager-0.0.1.vsix"
echo ""
echo "To install:"
echo "  code --install-extension swift-dependency-manager-0.0.1.vsix"
