#!/bin/bash
set -eux -o pipefail

# This script is used in the "npm pack" step in our CI build pipelines.
# It runs (p)npm pack for all packages and outputs them to a folder.
# It also outputs a packagePublishOrder file per feed that contains the order in which the packages should be published.

echo PACKAGE_MANAGER=$PACKAGE_MANAGER
echo RELEASE_GROUP=$RELEASE_GROUP
echo STAGING_PATH=$STAGING_PATH

mkdir -p $STAGING_PATH/pack/tarballs/
mkdir $STAGING_PATH/test-files/

# Runs pack on all packages in the release group and moves the tarballs to the staging folder.
# If test files are found, they are moved to the test-files folder.
if [ -f ".releaseGroup" ]; then
  flub exec --no-private --concurrency=1 --releaseGroup $RELEASE_GROUP -- "$PACKAGE_MANAGER pack" && \
  flub exec --no-private --concurrency=1 --releaseGroup $RELEASE_GROUP -- "mv -t $STAGING_PATH/pack/tarballs/ ./*.tgz" && \
  flub exec --no-private --releaseGroup $RELEASE_GROUP -- "[ ! -f ./*test-files.tar ] || (echo 'test files found' && mv -t $STAGING_PATH/test-files/ ./*test-files.tar)"

else
  $PACKAGE_MANAGER pack && mv -t $STAGING_PATH/pack/tarballs/ ./*.tgz
fi

# This saves a list of the packages in the working directory in topological order to a temporary file.
# Packages will be published in this order to avoid dependency issues.
# See tools/pipelines/templates/include-publish-npm-package-steps.yml for details about how this file is used.
flub list $RELEASE_GROUP --no-private --feed public --outFile $STAGING_PATH/pack/packagePublishOrder-public.txt
flub list $RELEASE_GROUP --no-private --feed internal-build --outFile $STAGING_PATH/pack/packagePublishOrder-internal-build.txt
flub list $RELEASE_GROUP --no-private --feed internal-dev --outFile $STAGING_PATH/pack/packagePublishOrder-internal-dev.txt
flub list $RELEASE_GROUP --no-private --feed internal-test --outFile $STAGING_PATH/pack/packagePublishOrder-internal-test.txt
