git reset --hard origin/main
wget --output-document patch.patch https://patch-diff.githubusercontent.com/raw/microsoft/FluidFramework/pull/14410.patch
git apply patch.patch
rm patch.patch
