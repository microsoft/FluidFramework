#!/bin/bash

set -eux -o pipefail

############
# ADD BIOME
############

# clean up lint tasks to use fluid-build
npe scripts.lint "fluid-build . --task lint"
npe scripts.lint:fix "fluid-build . --task eslint:fix --task format"

# add biome dependency if needed
npe "devDependencies.@biomejs/biome" "^1.6.2"

# add biome formatting and check scripts
npe scripts.format:biome "biome check --apply ."
npe scripts.check:biome "biome check ."

if [[ "$(uname)" == "Darwin" ]]; then
	configPath=$(grealpath --relative-to=$(pwd) $(git rev-parse --show-toplevel)/biome.json)
else
	configPath=$(realpath --relative-to=$(pwd) $(git rev-parse --show-toplevel)/biome.json)
fi

if [ ! -f "biome.jsonc" ]; then
	# Add local biome config file. Note that the `extends` property should point to the root biome.json file and may need
	# to be updated depending on the project.
cat << EOF > biome.jsonc
{
	"\$schema": "./node_modules/@biomejs/biome/configuration_schema.json",
	"extends": ["$configPath"],
	"formatter": {
		"enabled": true
	}
}

EOF
fi

