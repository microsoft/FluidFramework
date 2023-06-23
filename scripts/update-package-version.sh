# This script is used in the "update package versions" step in our CI build pipelines.
# It takes version data from environment variables and updates the package versions accordingly.
# The environment variables are set earlier in the pipeline, in the "set package version" step.

echo SETVERSION_VERSION=$SETVERSION_VERSION
echo SETVERSION_CODEVERSION=$SETVERSION_CODEVERSION
echo RELEASE_GROUP=$RELEASE_GROUP
echo INTERDEPENDENCY_RANGE="'$INTERDEPENDENCY_RANGE'"

if [ -f "lerna.json" ]; then
  if [ "$VERSION_RELEASE" = "release" ]; then
      echo "release group with '$INTERDEPENDENCY_RANGE' deps"
      echo command="flub bump $RELEASE_GROUP --exact $SETVERSION_VERSION --exactDepType=\"$INTERDEPENDENCY_RANGE\" -xv"
      flub bump $RELEASE_GROUP --exact $SETVERSION_VERSION --exactDepType="$INTERDEPENDENCY_RANGE" -xv
  else
    # this is a non-release build of a release group, so always use exact interdependencies, otherwise
    # dev/test builds may accidentally bring in different versions.
    echo "release group non-release build"
    echo command="flub bump $RELEASE_GROUP --exact $SETVERSION_VERSION --exactDepType=\"\" -xv"
    flub bump $RELEASE_GROUP --exact $SETVERSION_VERSION --exactDepType="" -xv
  fi
else
  echo "independent package"
  npm version $SETVERSION_VERSION --no-git-tag-version -f --allow-same-version
fi
