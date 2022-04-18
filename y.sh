for file in $(fd package.json --type file); do
    # echo "$file"

    # echo '  npm:      ==> pnpm:'
    sd 'npm:' 'yarn:' "$file"

    # echo '  npm run   ==> pnpm run'
    sd 'npm run ' 'yarn run ' "$file"
    # sd '"tsc": "tsc"' '"tsc": "yarn pnpify tsc"' "$file"

    sd 'yarn:@' 'npm:@' "$file"
done
