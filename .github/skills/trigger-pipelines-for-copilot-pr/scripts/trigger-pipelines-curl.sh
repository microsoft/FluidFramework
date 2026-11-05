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

if ! command -v curl >/dev/null 2>&1; then
	printf 'curl is required.\n' >&2
	exit 1
fi

if [ -z "${GITHUB_TOKEN:-}" ]; then
	printf 'GITHUB_TOKEN is required.\n' >&2
	exit 1
fi

script_directory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

while IFS= read -r comment; do
	printf '{"body":"%s"}' "$comment" |
		curl --fail-with-body --silent --show-error --location \
			--request POST \
			--header 'Accept: application/vnd.github+json' \
			--header "Authorization: Bearer $GITHUB_TOKEN" \
			--header 'X-GitHub-Api-Version: 2022-11-28' \
			--header 'Content-Type: application/json' \
			--data-binary @- \
			"https://api.github.com/repos/microsoft/FluidFramework/issues/$1/comments"
done < "$script_directory/pipeline-commands.txt"
