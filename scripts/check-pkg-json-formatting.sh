# Check the package.json at the root of the release group/package
npx --no-install prettier --check package.json

if [ -f "lerna.json" ]; then
  # Run on all the release group packages, if in a release group
  npx --no-install lerna exec prettier -- --check package.json
fi
