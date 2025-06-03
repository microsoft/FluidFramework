#!/bin/bash

set -eu -o pipefail
# This script validates the hashes of inline scripts in the index.html file against the configured hashes in the staticwebapp.config.json file.
indexFile="build/index.html"
configFile="static/staticwebapp.config.json"

echo "Extracting and hashing inline scripts from $indexFile"

expectedHashes="expected_hashes.txt"
generatedHashes="generated_hashes.txt"
> "$expectedHashes"
> "$generatedHashes"

# Extract inline scripts and compute hashes
awk 'BEGIN { RS="</script>"; FS="<script[^>]*>" }
NF>1 { print $2 }' "$indexFile" | while read -r scriptContent; do
if [[ "$scriptContent" != "" ]]; then
echo "$scriptContent" | tr -d '\n'| openssl dgst -sha256 -binary | openssl base64 | sed 's/^/sha256-/' >> "$generatedHashes"
fi
done

echo "Extracted Hashes:"
cat "$generatedHashes"

echo "Reading configured hashes from $configFile"
grep -oE "sha256-[A-Za-z0-9+/=]{43,45}" "$configFile" | sort | uniq > $expectedHashes
cat $expectedHashes

echo "Validating..."
fail=0
while read -r actualHash; do
if ! grep -q "$actualHash" $expectedHashes; then
echo "Missing hash in config: $actualHash"
fail=1
else
echo "Hash matched: $actualHash"
fi
done < "$generatedHashes"

rm -f "$generatedHashes" "$expectedHashes"

if [ "$fail" -ne 0 ]; then
echo "Inline script hashes do not match configured values. Override the hashes in $configFile with the extracted hashes."
exit 1
fi

echo "All inline script hashes are valid."
