#!/bin/bash

# Build docs for the whole repo
# All generated files will be in _api-extractor-temp

function parse_git_hash() {
  git rev-parse --short HEAD 2> /dev/null | sed "s/\(.*\)/\1/"
}

# GIT_HASH=$(parse_git_hash)
# echo "hash: ${GIT_HASH}"

# git checkout master
# git reset --hard origin/master
# MASTER_HASH=$(parse_git_hash)
# echo "master: ${MASTER_HASH}"
# cp -r tools/fluid-build fluid-build
# echo "copied"
# git checkout ${GIT_HASH}

# pushd fluid-build
# npm install --unsafe-perm
# rm -rf dist
# echo "removed dist"
# npm run build
# echo "built fluid-build"
# popd

# node fluid-build/dist/fluidBuild.js --all --install -v


echo "===================================Building client"
npm install --unsafe-perm
npm run build:fast -- --symlink
npm run build:fast -- --nolint
# npm run build:ci
npm run build:docs
ls _api-extractor-temp/doc-models

echo "===================================Building common-defs"
pushd common/lib/common-definitions
npm install --unsafe-perm
npm run build
npm run build:docs
# cp -r _api-extractor-temp ../../../_api-extractor-temp
popd
ls _api-extractor-temp/doc-models


echo "===================================Building common-utils"
pushd common/lib/common-utils
npm install --unsafe-perm
npm run build
npm run build:docs
# cp -r _api-extractor-temp ../../../_api-extractor-temp
popd
ls _api-extractor-temp/doc-models


# node ./fluid-build/dist/fluidBuild.js --install -v --root .
# node ./fluid-build/dist/fluidBuild.js --symlink -v --root .
echo "===================================Building server"
pushd server/routerlicious
npm install --unsafe-perm
npm run build
npm run build:docs
# cp -r _api-extractor-temp ../../_api-extractor-temp
popd
ls _api-extractor-temp/doc-models
