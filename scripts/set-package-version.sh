# This script is used in CI to compare the version in a package's package.json to the expected version we're releasing,
# which is ser in the SETVERSION_VERSION environment variable.

pkg_version=$(node -p "require('./package.json').version")
if [ "$pkg_version" != "$SETVERSION_VERSION" ]; then
  exit 1
fi

exit 0
