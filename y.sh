for file in $(fd package.json --type file); do
    # echo "$file"

    # echo '  npm:      ==> pnpm:'
    sd 'npm:' 'yarn:' "$file"

    # echo '  npm run   ==> pnpm run'
    sd 'npm run ' 'yarn run ' "$file"
    # sd '"tsc": "tsc"' '"tsc": "yarn pnpify tsc"' "$file"

    sd 'yarn:@' 'npm:@' "$file"
    sd 'yarn:fluid-framework' 'npm:fluid-framework' "$file"

    sd '\-\-typescript-compiler-folder \./node_modules/typescript &&' '&&' "$file"
    sd '\-\-typescript-compiler-folder \.\./\.\./\.\./node_modules/typescript &&' '&&' "$file"
    # sd '  ' ' ' "$file"
done

# for file in $(fd package.json --type file); do
#     sd  '"\^0\.1036\.1000-0"' '"0.1036.2000"' "$file"
# done
