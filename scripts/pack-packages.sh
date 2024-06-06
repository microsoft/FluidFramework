#!/bin/bash
set -eux -o pipefail

# This script is used in the "npm pack" step in our CI build pipelines.
# It runs (p)npm pack for all packages and outputs them to a folder.
# It also outputs a packagePublishOrder.txt file that contains the order that the packages should be published in.

echo PACKAGE_MANAGER=$PACKAGE_MANAGER
echo RELEASE_GROUP=$RELEASE_GROUP
echo STAGING_PATH=$STAGING_PATH

mkdir -p $STAGING_PATH/pack/tarballs/
mkdir $STAGING_PATH/test-files/

if [ -f ".releaseGroup" ]; then
  flub exec --no-private --concurrency=1 --releaseGroup $RELEASE_GROUP -- "$PACKAGE_MANAGER pack" && \
  flub exec --no-private --concurrency=1 --releaseGroup $RELEASE_GROUP -- "mv -t $STAGING_PATH/pack/tarballs/ ./*.tgz" && \
  flub exec --no-private --releaseGroup $RELEASE_GROUP -- "[ ! -f ./*test-files.tar ] || (echo 'test files found' && mv -t $STAGING_PATH/test-files/ ./*test-files.tar)"

else
  $PACKAGE_MANAGER pack && mv -t $STAGING_PATH/pack/tarballs/ ./*.tgz
fi

# This saves a list of the packages in the working directory in topological order to a temporary file.
# Each package name is modified to match the packed tar files.
# TODO: The --tarball flag can be removed once the flub publish command is tested and no longer in dry-run mode.
flub list $RELEASE_GROUP --no-private --tarball --feed public > $STAGING_PATH/pack/packagePublishOrder-public.txt
flub list $RELEASE_GROUP --no-private --tarball --feed internal-build > $STAGING_PATH/pack/packagePublishOrder-internal-build.txt
flub list $RELEASE_GROUP --no-private --tarball --feed internal-dev > $STAGING_PATH/pack/packagePublishOrder-internal-dev.txt
flub list $RELEASE_GROUP --no-private --tarball --feed internal-test > $STAGING_PATH/pack/packagePublishOrder-internal-test.txt
