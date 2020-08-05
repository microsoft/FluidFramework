#!/bin/bash

# Build docs for the whole repo
# All generated files will be in _api-extractor-temp

cd ..

# echo "===================================npm clean"
# npm run clean

# echo "===================================npm install"
# npm install --unsafe-perm

echo "===================================npm clean all"
npm run build:fast -- --clean --all

echo "===================================npm build:fast --symlink --all"
npm run build:fast -- --install --symlink:full --all

echo "===================================npm build:fast --install --symlink --all"
npm run build:fast -- --install --symlink --all

echo "===================================npm run build:fast -- --nolint --all -s build -s build:docs"
npm run build:fast -- --nolint --all -s build -s build:docs

cd docs
