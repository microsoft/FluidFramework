#!/bin/bash
set -eux -o pipefail

# This script is used in the "npm pack" step in our CI build pipelines.
# It runs (p)npm pack for all packages and outputs them to a folder.
# It also outputs a packagePublishOrder file per feed that contains the order in which the packages should be published.

echo PACKAGE_MANAGER=$PACKAGE_MANAGER
echo RELEASE_GROUP=$RELEASE_GROUP
echo STAGING_PATH=$STAGING_PATH

TARBALLS_DIR="$STAGING_PATH/pack/tarballs"

mkdir -p "$TARBALLS_DIR/"
mkdir "$STAGING_PATH/test-files/"

# Runs pack on all packages in the release group and moves the tarballs to the staging folder.
# If test files are found, they are moved to the test-files folder.
# Note: use of package's pack:tests is only supported for pnpm as PACKAGE_MANAGER.
if [ -f ".releaseGroup" ]; then
  if [ "$PACKAGE_MANAGER" == "pnpm" ]; then
    flub exec --no-private --concurrency=1 --releaseGroup $RELEASE_GROUP -- "pnpm --if-present pack:tests"
  fi
  flub exec --no-private --concurrency=1 --releaseGroup $RELEASE_GROUP -- "$PACKAGE_MANAGER pack"
  flub exec --no-private --concurrency=1 --releaseGroup $RELEASE_GROUP -- "mv -t $TARBALLS_DIR/ ./*.tgz"
  flub exec --no-private --releaseGroup $RELEASE_GROUP -- "[ ! -f ./*test-files.tar ] || (echo 'test files found' && mv -t $STAGING_PATH/test-files/ ./*test-files.tar)"

  # Clean up generated files that are listed in a package's "files" array (e.g. oclif.manifest.json) after packing.
  # These are produced during build and intentionally shipped in the published tarball, but should not linger in
  # the working tree. This cleanup deliberately runs here rather than in a package "postpack" script: under
  # pnpm >=11, `pnpm pack` re-stats every "files" entry after postpack runs and fails with ENOENT if postpack
  # deleted one. Running it here, after all packs complete, avoids that while still cleaning the working tree.
  flub exec --no-private --releaseGroup $RELEASE_GROUP -- "pnpm run --if-present clean:manifest"

else
  if [ "$PACKAGE_MANAGER" == "pnpm" ]; then
    pnpm --if-present pack:tests
  fi
  $PACKAGE_MANAGER pack
  mv -t "$TARBALLS_DIR/" ./*.tgz
fi

if [ "$RELEASE_GROUP" == "build-tools" ] && [ "$PACKAGE_MANAGER" == "pnpm" ]; then
  if [ ! -f "pnpm-lock.yaml" ]; then
    echo "Error: build-tools publish install must include pnpm-lock.yaml"
    exit 1
  fi

  echo "Generating lockfile-backed build-tools publish install project in $TARBALLS_DIR"

  package_manager=$(jq -r '.packageManager' package.json)
  if [ -z "$package_manager" ] || [ "$package_manager" == "null" ]; then
    echo "Error: package.json must specify packageManager for build-tools publish install"
    exit 1
  fi

  manual_overrides='{
    "oclif>@aws-sdk/client-cloudfront": "-",
    "oclif>@aws-sdk/client-s3": "-"
  }'
  tarball_dependencies='{}'
  tarball_overrides='{}'
  if ! ls "$TARBALLS_DIR"/*.tgz > /dev/null 2>&1; then
    echo "Error: No build-tools tarballs found in $TARBALLS_DIR"
    exit 1
  fi
  for tgz in "$TARBALLS_DIR"/*.tgz; do
    pkg_name=$(tar -xzf "$tgz" --to-stdout package/package.json | jq -r '.name')
    tgz_file=$(basename "$tgz")
    echo "Adding build-tools install dependency and override for $pkg_name -> file:$tgz_file"
    tarball_dependencies=$(echo "$tarball_dependencies" | jq --arg name "$pkg_name" --arg file "file:$tgz_file" '. + {($name): $file}')
    tarball_overrides=$(echo "$tarball_overrides" | jq --arg name "$pkg_name" --arg file "file:$tgz_file" '. + {($name): $file}')
  done

  jq -n \
    --arg packageManager "$package_manager" \
    --argjson dependencies "$tarball_dependencies" \
    --argjson manual "$manual_overrides" \
    --argjson tarballs "$tarball_overrides" \
    '{
      "name": "build-tools-install",
      "private": true,
      "packageManager": $packageManager,
      "dependencies": $dependencies,
      "pnpm": {
        "overrides": ($manual + $tarballs)
      }
    }' > "$TARBALLS_DIR/package.json"

  cp pnpm-lock.yaml "$TARBALLS_DIR/pnpm-lock.yaml"
  (
    cd "$TARBALLS_DIR"
    pnpm install --lockfile-only --ignore-scripts
  )
fi

# This saves a list of the packages in the working directory in topological order to a temporary file.
# Packages will be published in this order to avoid dependency issues.
# See tools/pipelines/templates/include-publish-npm-package-steps.yml for details about how this file is used.
flub list $RELEASE_GROUP --no-private --feed public --outFile $STAGING_PATH/pack/packagePublishOrder-public.txt
flub list $RELEASE_GROUP --no-private --feed internal-build --outFile $STAGING_PATH/pack/packagePublishOrder-internal-build.txt
flub list $RELEASE_GROUP --no-private --feed internal-dev --outFile $STAGING_PATH/pack/packagePublishOrder-internal-dev.txt
flub list $RELEASE_GROUP --no-private --feed internal-test --outFile $STAGING_PATH/pack/packagePublishOrder-internal-test.txt
