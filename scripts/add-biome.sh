#!/bin/bash

# This script adds biome to a project. By itself, none of the changes made by this script will take effect in the build.
# In order to completely switch away from prettier and to biome, the `rm-prettier.sh` script should be run after this
# one.
#
# THIS SCRIPT DOES NOT RUN ON WINDOWS.
#
# REQUIRED DEPENDENCIES:
#
# This script requires the `npe` package be installed globally. To do that run `pnpm add -g npe`.

set -eux -o pipefail

# add biome dependency
npe "devDependencies.@biomejs/biome" "^1.6.1"

# add biome formatting and check scripts
npe scripts.format "fluid-build --task format ."
npe scripts.format:biome "biome check --apply ."
npe scripts.check:biome "biome check ."
npe scripts.check:format "fluid-build --task check:format ."

# Add local biome config file. Note that the `extends` property should point to the root biome.json file and may need to
# be updated depending on the project.
cat << EOF > biome.jsonc
{
	"\$schema": "./node_modules/@biomejs/biome/configuration_schema.json",
	"extends": ["../../../biome.json"],
	"formatter": {
		"enabled": true,
	},
	// "files": {
	// 	 "ignore": [],
	// },
}

EOF

pnpm run format
