echo SETVERSION_VERSION=$SETVERSION_VERSION
if [ -f "lerna.json" ]; then
  # if [ "$VERSION_RELEASE" = "release" ]; then
    # no need to run anything here, as the version in the package should be correct
    npx lerna exec "if [ \`npm -s run env echo '\$npm_package_version'\` != '$(SetVersion.version)' ]; then ( exit 1 ) fi"
    exit $?
  # fi
  npx lerna version $(SetVersion.version) --no-git-tag-version --no-push --yes --exact
else
  npm version $(SetVersion.version) --no-git-tag-version -f --allow-same-version
fi
