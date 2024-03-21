#!/bin/bash

# This script adds biome to a project. It also removes prettier from the project and updatesvarious scripts to use biome
# and/or remove prettier. It also adds a local biome config file to the project.
#
# THIS SCRIPT DOES NOT RUN ON WINDOWS.
#
# REQUIRED DEPENDENCIES:
#
# This script requires the `npe` package be installed globally. To do that run `pnpm add -g npe`.

set -eux -o pipefail

############
# Add biome
############

# add biome dependency if needed
npe "devDependencies.@biomejs/biome" "^1.6.1"

# add biome formatting and check scripts
npe scripts.format "fluid-build --task format ."
npe scripts.format:biome "biome check --apply ."
npe scripts.check:biome "biome check ."
npe scripts.check:format "fluid-build --task check:format ."

# clean up lint task
npe scripts.lint "fluid-build . --task lint"
npe scripts.lint:fix "fluid-build . --task eslint:fix --task format"

configPath=$(realpath --relative-to=$(pwd) $(git rev-parse --show-toplevel)/biome.json)

# Add local biome config file. Note that the `extends` property should point to the root biome.json file and may need to
# be updated depending on the project.
cat << EOF > biome.jsonc
{
	"\$schema": "./node_modules/@biomejs/biome/configuration_schema.json",
	"extends": ["$configPath"],
	"formatter": {
		"enabled": true
	}
}

EOF

##################
# REMOVE PRETTIER
##################

# remove prettier scripts
npe scripts.format:prettier --delete
npe scripts.check:prettier --delete
npe scripts.prettier --delete
npe scripts.prettier:fix --delete

# remove prettier dep and config files
npe devDependencies.prettier --delete
rm -f .prettierignore prettier.config.cjs

pnpm run format
