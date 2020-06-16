#!/bin/bash

# Build docs for the whole repo
# All generated files will be in _api-extractor-temp

cd ..

echo "===================================npm install"
npm install --unsafe-perm

echo "===================================npm build:fast --install"
npm run build:fast -- --install

echo "===================================npm build:fast --symlik"
npm run build:fast -- --symlink

echo "===================================npm build:fast --all"
npm run build:fast -- --nolint --all

echo "===================================npm build:fast --all -s build:docs"
npm run build:fast -- --nolint --all -s build:docs

cd docs
