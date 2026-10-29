#!/usr/bin/env bash
# Copyright (c) Microsoft Corporation and contributors. All rights reserved.
# Licensed under the MIT License.

set -euo pipefail

destination="${1:?Usage: bash install-linkcheck.sh <destination>}"
version=3.0.0

# These are the same upstream archives previously installed by linkcheck-bin.
case "$(uname -s)-$(uname -m)" in
    Linux-x86_64)
        platform=linux-x64
        checksum=817629c7077cea9bef4b9d66d5b8d029575e103da3fea9c49d55b45083a8e786
        ;;
    Linux-aarch64|Linux-arm64)
        platform=linux-arm64
        checksum=583fc8cf760a3732a20a9d751903351772d91f046c2080244b96e2b1021eb501
        ;;
    Darwin-x86_64)
        platform=macos-x64
        checksum=a51f00fadbb96a4a95316b8a35a609cd929de91b8d8058b4f8de5089d6c9714e
        ;;
    Darwin-arm64)
        platform=macos-arm64
        checksum=cb185308e2e05ecf5b129a7dca7d283cf5e9ee13e521041414562dd273b2d633
        ;;
    *)
        echo "Unsupported platform: $(uname -s)-$(uname -m). Install linkcheck ${version} from https://github.com/filiph/linkcheck/releases/tag/${version}." >&2
        exit 1
        ;;
esac

temporary_directory="$(mktemp -d)"
archive="$temporary_directory/linkcheck.tar.gz"
trap 'rm -f "$archive"; rmdir "$temporary_directory"' EXIT
curl --fail --show-error --location \
    "https://github.com/filiph/linkcheck/releases/download/${version}/linkcheck-${version}-${platform}.tar.gz" \
    --output "$archive"

if [[ "$platform" == macos-* ]]; then
    printf '%s  %s\n' "$checksum" "$archive" | shasum -a 256 --check
else
    printf '%s  %s\n' "$checksum" "$archive" | sha256sum --check
fi

mkdir -p "$destination"
tar -xzf "$archive" -C "$destination"
chmod +x "$destination/linkcheck/linkcheck"
"$destination/linkcheck/linkcheck" --version
