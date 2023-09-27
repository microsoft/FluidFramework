#!/bin/bash
set -eux -o pipefail

# This script is used in the "npm pack" step in our CI build pipelines.
# It runs (p)npm pack for all packages and sorts them into scoped/unscoped folders.
# It also outputs a packagePublishOrder.txt file that contains the order that the packages should be published in.

echo PACKAGE_MANAGER=$PACKAGE_MANAGER
echo PUBLISH_NON_SCOPED=$PUBLISH_NON_SCOPED
echo RELEASE_GROUP=$RELEASE_GROUP
echo STAGING_PATH=$STAGING_PATH

mkdir $STAGING_PATH/pack/
mkdir $STAGING_PATH/pack/scoped/
mkdir $STAGING_PATH/test-files/

if [[ "$PUBLISH_NON_SCOPED" == "True" ]]; then
  mkdir $STAGING_PATH/pack/non-scoped/
fi

if [ -f ".releaseGroup" ]; then
  flub exec --no-private --concurrency=1 --releaseGroup $RELEASE_GROUP -- "$PACKAGE_MANAGER pack" && \
  flub exec --no-private --concurrency=1 --releaseGroup $RELEASE_GROUP -- "mv -t $STAGING_PATH/pack/scoped/ ./*.tgz" && \
  flub exec --no-private --releaseGroup $RELEASE_GROUP -- "[ ! -f ./*test-files.tar ] || (echo 'test files found' && mv -t $STAGING_PATH/test-files/ ./*test-files.tar)"

  # This saves a list of the packages in the working directory in topological order to a temporary file.
  # Each package name is modified to match the packed tar files.
  flub list --no-private --releaseGroup $RELEASE_GROUP --tarball > $STAGING_PATH/pack/packagePublishOrder.txt

  flub list --no-private --releaseGroup $RELEASE_GROUP --tarball --feed official > $STAGING_PATH/pack/packagePublishOrder-official.txt
  flub list --no-private --releaseGroup $RELEASE_GROUP --tarball --feed internal > $STAGING_PATH/pack/packagePublishOrder-internal.txt
  flub list --no-private --releaseGroup $RELEASE_GROUP --tarball --feed internal-test > $STAGING_PATH/pack/packagePublishOrder-internal-test.txt

else
  $PACKAGE_MANAGER pack && mv -t $STAGING_PATH/pack/scoped/ ./*.tgz
fi
