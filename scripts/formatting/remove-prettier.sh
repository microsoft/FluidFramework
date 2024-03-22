##################
# REMOVE PRETTIER
##################

# Reset scripts to use fluid-build
npe scripts.check:format "fluid-build --task check:format ."
npe scripts.format "fluid-build --task format ."

# remove prettier scripts
npe scripts.format:prettier --delete
npe scripts.check:prettier --delete
npe scripts.prettier --delete
npe scripts.prettier:fix --delete

# remove prettier dep and config files
npe devDependencies.prettier --delete
rm -f .prettierignore prettier.config.cjs

pnpm run format
