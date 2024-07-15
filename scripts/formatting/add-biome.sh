#!/bin/bash

set -eux -o pipefail

####################
# ADD BIOME SCRIPTS
####################

# Set format scripts to use prettier since we're not enabling biome yet
npe scripts.format "npm run format:prettier"
npe scripts.check:format "npm run check:prettier"

npe scripts.check:biome "biome check ."
npe scripts.format:biome "biome check . --write"
npe devDependencies.@biomejs/biome "^1.7.3"


# sd --fixed-strings '"check:prettier": "p' '"check:prettier:old": "p' package.json
# sd --fixed-strings '"format:prettier": "p' '"format:prettier:old": "p' package.json

if [[ "$(uname)" == "Darwin" ]]; then
	biomePath=$(grealpath --relative-to=$(pwd) $(git rev-parse --show-toplevel)/biome.jsonc)
	prettierIgnore=$(grealpath --relative-to=$(pwd) $(git rev-parse --show-toplevel)/.prettierignore)
else
	biomePath=$(realpath --relative-to=$(pwd) $(git rev-parse --show-toplevel)/biome.jsonc)
	prettierIgnore=$(realpath --relative-to=$(pwd) $(git rev-parse --show-toplevel)/.prettierignore)
fi

# Some packages might be missing the prettier scripts, so add them defensively
npe scripts.check:prettier "prettier --check . --cache --ignore-path $prettierIgnore"
npe scripts.format:prettier "prettier --write . --cache --ignore-path $prettierIgnore"

# Also remove some scripts that aren't needed anymore
npe scripts.prettier --delete
npe scripts.prettier:fix --delete

if [ ! -f "biome.jsonc" ]; then
	# Add local biome config file. Note that the `extends` property should point to the root biome.json file and may need
	# to be updated depending on the project.
cat << EOF > biome.jsonc
{
	"\$schema": "./node_modules/@biomejs/biome/configuration_schema.json",
	"extends": ["$biomePath"],
}

EOF
fi

pnpm run format
