# for file in $(fd package.json --type file); do
#     # echo "$file"

#     # echo '  npm:      ==> pnpm:'
#     sd 'npm:' 'yarn:' "$file"

#     # echo '  npm run   ==> pnpm run'
#     sd 'npm run ' 'yarn run ' "$file"
#     # sd '"tsc": "tsc"' '"tsc": "yarn pnpify tsc"' "$file"

#     sd 'yarn:@' 'npm:@' "$file"
#     sd 'yarn:fluid-framework' 'npm:fluid-framework' "$file"

#     sd '\-\-typescript-compiler-folder \./node_modules/typescript &&' '&&' "$file"
#     sd '\-\-typescript-compiler-folder \.\./\.\./\.\./node_modules/typescript &&' '&&' "$file"
#     # sd '  ' ' ' "$file"
# done

for file in $(fd package.json --type file); do
    # echo "$file"

    # echo '  npm:      ==> pnpm:'
    sd 'yarn:' 'npm:' "$file"

    # echo '  npm run   ==> pnpm run'
    sd 'yarn run ' 'npm run ' "$file"
    # sd '"tsc": "tsc"' '"tsc": "yarn pnpify tsc"' "$file"

    sd 'yarn:@' 'npm:@' "$file"
    sd 'yarn:fluid-framework' 'npm:fluid-framework' "$file"

    # sd '\-\-typescript-compiler-folder \./node_modules/typescript &&' '&&' "$file"
    # sd '\-\-typescript-compiler-folder \.\./\.\./\.\./node_modules/typescript &&' '&&' "$file"
    # sd '  ' ' ' "$file"
done

# for file in $(fd package.json --type file); do
    # sd  '"\^0\.1036\.1000-0"' '"0.1036.2000"' "$file"
    # sd  '"\^0\.1028\.1000\-0"' '"^0.1028.1000-58358"' "$file"
    # sd  '"\^0\.1036\.1000\-0"' '"^0.1036.1000-58953"' "$file"
    # sd  '"\^0\.43\.1000\-0"' '"^0.43.1000-60792"' "$file"
    # sd  '"\^0\.46\.1000\-0"' '"^0.46.1000-59258"' "$file"
    # sd  '"\^0\.48\.1000\-0"' '"^0.48.1000-60762"' "$file"

# done
