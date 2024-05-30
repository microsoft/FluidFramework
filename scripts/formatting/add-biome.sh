#!/bin/bash

set -eux -o pipefail

####################
# ADD BIOME SCRIPTS
####################

# Set format scripts to use prettier since we're not enabling biome yet
npe scripts.format "npm run format:prettier"
npe scripts.check:format "npm run check:prettier"

npe scripts.check:biome "biome check . --formatter-enabled=true --organize-imports-enabled=true"
npe scripts.format:biome "biome check . --formatter-enabled=true --organize-imports-enabled=true --apply"
npe devDependencies.@biomejs/biome "^1.7.3"

# Some packages might be missing the prettier scripts, so add them defensively
npe scripts.check:prettier "prettier --check . --cache --ignore-path ../../../.prettierignore"
npe scripts.format:prettier "prettier --write . --cache --ignore-path ../../../.prettierignore"

# sd --fixed-strings '"check:prettier": "p' '"check:prettier:old": "p' package.json
# sd --fixed-strings '"format:prettier": "p' '"format:prettier:old": "p' package.json

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
}

EOF
fi

pnpm run format
