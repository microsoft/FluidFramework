# This script is used in the "npm pack" step in our CI build pipelines.
# It runs (p)npm pack for all packages and sorts them into scoped/unscoped folders.
# It also outputs a packagePublishOrder.txt file that contains the order that the packages should be published in.

echo RELEASE_GROUP=$RELEASE_GROUP

mkdir $(Build.ArtifactStagingDirectory)/pack/
mkdir $(Build.ArtifactStagingDirectory)/pack/scoped/
mkdir $(Build.ArtifactStagingDirectory)/test-files/
if [[ "$(PUBLISH_NON_SCOPED)" == "True" ]]; then
  mkdir $(Build.ArtifactStagingDirectory)/pack/non-scoped/
fi
if [ -f "pnpm-workspace.yaml" ]; then
  flub exec --no-private --concurrency=1 --releaseGroup $RELEASE_GROUP -- "$(PACKAGE_MANAGER) pack"

  flub exec --no-private --concurrency=1 --releaseGroup $RELEASE_GROUP -- "mv -t $(Build.ArtifactStagingDirectory)/pack/scoped/ ./*.tgz"

  flub exec --no-private --releaseGroup $RELEASE_GROUP -- "[ ! -f ./*test-files.tar ] || (echo 'test files found' && mv -t $(Build.ArtifactStagingDirectory)/test-files/ ./*test-files.tar)"

  # This saves a list of the packages in the working directory in topological order to a temporary file.
  # Each package name is modified to match the packed tar files.
  flub list --no-private --releaseGroup $RELEASE_GROUP --tarball > $(Build.ArtifactStagingDirectory)/pack/packagePublishOrder.txt
else
  $PACKAGE_MANAGER pack && mv -t $(Build.ArtifactStagingDirectory)/pack/scoped/ ./*.tgz
fi
