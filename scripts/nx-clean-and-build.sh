#!/usr/bin/env bash
# Helper script for Nx builds: cleans stale build output before running a build script.
# TypeScript's composite mode (TS5055) fails when stale .d.ts files from a previous build
# exist in the output directory. This script removes them before running the actual build.
#
# Usage: nx-clean-and-build.sh <script-name>
# Example: nx-clean-and-build.sh tsc
#          nx-clean-and-build.sh build:esnext

set -eo pipefail

script_name="$1"
if [ -z "$script_name" ]; then
	echo "Usage: nx-clean-and-build.sh <script-name>" >&2
	exit 1
fi

# Read the script command from package.json
script_cmd=$(node -p "JSON.parse(require('fs').readFileSync('package.json', 'utf8')).scripts['$script_name'] || ''")

if [ -z "$script_cmd" ]; then
	echo "No script '$script_name' found in package.json" >&2
	exit 1
fi

# Clean stale output directories that cause TS5055 with composite: true
rm -rf dist lib *.tsbuildinfo

# Execute the original build script
eval "$script_cmd"
