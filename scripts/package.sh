#!/usr/bin/env bash
# Build and package the Decky install zip: release/minimi-town-<version>.zip
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION=$(node -p "require('./package.json').version")
bun build/build.ts
rm -rf release/pkg && mkdir -p release/pkg/minimi-town/dist
cp dist/index.js release/pkg/minimi-town/dist/
cp plugin.json package.json main.py README.md LICENSE release/pkg/minimi-town/
(cd release/pkg && zip -qr "../minimi-town-${VERSION}.zip" minimi-town)
rm -rf release/pkg
echo "release/minimi-town-${VERSION}.zip"
