#!/bin/sh
set -eu

if [ "$#" -ne 1 ]; then
	printf 'Usage: %s <pr-number>\n' "$0" >&2
	exit 1
fi

case "$1" in
	''|*[!0-9]*|0*)
		printf "Invalid pull request number '%s'.\n" "$1" >&2
		exit 1
		;;
esac

if ! command -v gh >/dev/null 2>&1; then
	printf 'GitHub CLI (gh) is required.\n' >&2
	exit 1
fi

script_directory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

while IFS= read -r comment; do
	MSYS_NO_PATHCONV=1 gh pr comment "$1" \
		--repo microsoft/FluidFramework \
		--body "$comment"
done < "$script_directory/pipeline-commands.txt"
