# pwd
# echo SETVERSION_VERSION=$SETVERSION_VERSION
# echo npm_package_version=$npm_package_version
# node -p "require('./package.json').version"
# pkg_version=$(npm -s run env echo "$npm_package_version")
pkg_version=$(node -p "require('./package.json').version")
# echo pkg_version=$pkg_version

if [ "$pkg_version" != "$SETVERSION_VERSION" ]; then
  exit 1
fi

exit 0

# echo END $(pwd)
