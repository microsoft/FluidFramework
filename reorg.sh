# This script will move the client release group into a new subfolder called client. It only moves/modifies the minimum
# files to keep fluid-build happy. All changes the script makes are committed to git history so it's easyto revert
# everything.
#
# After running the script, fluid-build should work as expected.

mkdir -p client

git mv packages/ client/
git add .
git commit -m 'Pressurize: git mv packages/ client/'

git mv examples/ client/
git add .
git commit -m 'Pressurize: git mv examples/ client/'

git mv experimental/ client/
git add .
git commit -m 'Pressurize: git mv experimental/ client/'

cp package.json client/package.json
git mv package-lock.json client/package-lock.json
git mv lerna-package-lock.json client/lerna-package-lock.json
git mv lerna.json client/lerna.json
git add .
git commit -m 'Pressurize: git mv lerna and package.json'

echo "Updating api-extractor paths"
for file in $(fd package.json --type file); do
    sd '../../../_api-extractor-temp/' '../../../../_api-extractor-temp/' "$file"
    sd ' --typescript-compiler-folder ../../../node_modules/typescript' '' "$file"
done

for file in $(fd api-extractor.json --type file client); do
    jq '. * {"apiReport": { "reportFolder": "<projectFolder>/../../../../api-report/" }, "docModel": {"apiJsonFilePath": "<projectFolder>/../../../../_api-extractor-temp/doc-models/<unscopedPackageName>.api.json"}}' "$file" > api-extractor2.json
    rm -rf api-extractor.json
    mv api-extractor2.json "$file"
done

git add .
git commit -m 'Pressurize: update api-extractor paths'

echo "Updating fluid-build client path in package.json"
jq '. * {"fluidBuild": {"repoPackages": {"client":{"directory": "client"}}}}' package.json > package2.json
rm -rf package.json
mv package2.json package.json
git add .
git commit -m 'Pressurize: Update fluid-build client path'

echo "Updating client CI pipeline"
for file in $(fd build-client.yml --type file tools/pipelines); do
    sd 'buildDirectory: .' 'buildDirectory: client' "$file"
done
git add .
git commit -m 'Pressurize: Update client CI pipeline'
