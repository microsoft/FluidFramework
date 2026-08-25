#!/bin/bash
set -eux -o pipefail

# Generates canonical package-name lists in dependency order for each publishing destination.
# Packing is intentionally handled elsewhere because Docker service builds must pack from their built image.

echo RELEASE_GROUP="$RELEASE_GROUP"
echo STAGING_PATH="$STAGING_PATH"

mkdir -p "$STAGING_PATH/pack"

flub list "$RELEASE_GROUP" --no-private --feed public --outFile "$STAGING_PATH/pack/packagePublishOrder-public.txt"
flub list "$RELEASE_GROUP" --no-private --feed internal-build --outFile "$STAGING_PATH/pack/packagePublishOrder-internal-build.txt"
flub list "$RELEASE_GROUP" --no-private --feed internal-dev --outFile "$STAGING_PATH/pack/packagePublishOrder-internal-dev.txt"
flub list "$RELEASE_GROUP" --no-private --feed internal-test --outFile "$STAGING_PATH/pack/packagePublishOrder-internal-test.txt"
