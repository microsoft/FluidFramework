echo SETVERSION_VERSION=$SETVERSION_VERSION
echo SETVERSION_CODEVERSION=$SETVERSION_CODEVERSION
echo RELEASE_GROUP=$RELEASE_GROUP
echo INTERDEPENDENCY_RANGE="$INTERDEPENDENCY_RANGE"

if [ -f "lerna.json" ]; then
  if [ "$VERSION_RELEASE" = "release" ]; then
    if [ "$INTERDEPENDENCY_RANGE" != " " ]; then
      echo command="flub bump $RELEASE_GROUP --exact $SETVERSION_VERSION --exactDepType=\"$INTERDEPENDENCY_RANGE\" -xv"
      flub bump $RELEASE_GROUP --exact $SETVERSION_VERSION --exactDepType="$INTERDEPENDENCY_RANGE" -xv
    else
      echo command="flub bump $RELEASE_GROUP --exact $SETVERSION_VERSION --exactDepType=\"\" -xv"
      flub bump $RELEASE_GROUP --exact $SETVERSION_VERSION --exactDepType="$INTERDEPENDENCY_RANGE" -xv
    fi
  else
    echo command="flub bump $RELEASE_GROUP --exact $SETVERSION_VERSION --exactDepType=\"\" -xv"
    flub bump $RELEASE_GROUP --exact $SETVERSION_VERSION --exactDepType="" -xv
  fi
else
  npm version $SETVERSION_VERSION --no-git-tag-version -f --allow-same-version
fi
