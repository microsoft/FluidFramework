#!/bin/bash

set -eux -o pipefail

###############
# ENABLE BIOME
###############

# Add format script if needed
npe scripts.format "fluid-build . --task format"

npe scripts.check:biome "biome check . --formatter-enabled=true"
npe scripts.format:biome "biome check . --apply --formatter-enabled=true"

sd --fixed-strings '"check:prettier": "p' '"check:prettier:old": "p' package.json
sd --fixed-strings '"format:prettier": "p' '"format:prettier:old": "p' package.json

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

pnpm run format
