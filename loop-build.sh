#!/usr/bin/env bash

set -e

npm run build

rm -rf loop-build
mkdir -p loop-build
cp -r build loop-build
cp -r bin loop-build
cp -r docs loop-build
cp -r assets loop-build
cp package.json loop-build
