#!/bin/bash

# This script validates the hashes of inline scripts in the index.html file against the configured hashes in the staticwebapp.config.json file.
indexFile="build/index.html"
configFile="static/staticwebapp.config.json"

echo "Extracting and hashing inline scripts from $indexFile"

tmpHashesFile="generated_hashes.txt"
> "$tmpHashesFile"

# Extract inline scripts and compute hashes
awk 'BEGIN { RS="</script>"; FS="<script[^>]*>" }
NF>1 { print $2 }' "$indexFile" | while read -r scriptContent; do
if [[ "$scriptContent" != "" ]]; then
echo "$scriptContent" | tr -d '\n'| openssl dgst -sha256 -binary | openssl base64 | sed 's/^/sha256-/' >> "$tmpHashesFile"
fi
done

echo "Extracted Hashes:"
cat "$tmpHashesFile"

echo "Reading configured hashes from $configFile"
grep -oE "sha256-[A-Za-z0-9+/=]{43,45}" "$configFile" | sort | uniq > expected_hashes.txt
cat expected_hashes.txt

echo "Validating..."
fail=0
while read -r actualHash; do
if ! grep -q "$actualHash" expected_hashes.txt; then
echo "Missing hash in config: $actualHash"
fail=1
else
echo "Hash matched: $actualHash"
fi
done < "$tmpHashesFile"

if [ "$fail" -ne 0 ]; then
echo "Inline script hashes do not match configured values."
exit 1
fi

echo "All inline script hashes are valid."
