# This script is used in the "Update Package Version (flub)" step in our CI build pipelines.
# It takes version data from environment variables and updates the interdependency ranges accordingly.
# The environment variables are set earlier in the pipeline, in the "Set Package Version" step.

set -eux -o pipefail

echo RELEASE_GROUP=$RELEASE_GROUP
echo INTERDEPENDENCY_RANGE="'$INTERDEPENDENCY_RANGE'"

if [ "$VERSION_RELEASE" = "release" ]; then
    echo "release group with '$INTERDEPENDENCY_RANGE' deps"
    flub setInterdependencyRange $RELEASE_GROUP $SETVERSION_VERSION "$INTERDEPENDENCY_RANGE" -xv
else
  # this is a non-release build of a release group, so always use exact interdependencies, otherwise
  # dev/test builds may accidentally bring in different versions.
  echo "release group non-release build"
  flub setInterdependencyRange $RELEASE_GROUP $SETVERSION_VERSION "" -xv
fi
