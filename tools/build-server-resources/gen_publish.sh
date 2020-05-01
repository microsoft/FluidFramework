# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

# The script is used by the build server to set up and publish to a npm registry
# First argument of the script is expected to be the registry URL

if test "$1" = ""
then
        echo ERROR: Missing registry
        exit
fi

echo Generating publish script for $1
mkdir build_resources

# Generate .npmrc
echo "@prague:registry=$1" > build_resources/.npmrc
echo "@chaincode:registry=$1" >> build_resources/.npmrc
echo "@component:registry=$1" >> build_resources/.npmrc
echo "@microsoft:registry=$1" >> build_resources/.npmrc
echo "@fluid-internal:registry=$1" >> build_resources/.npmrc
echo "@fluid-example:registry=$1" >> build_resources/.npmrc
echo "always-auth=true" >> build_resources/.npmrc

# Generate publish.sh
echo "echo packages/*/* | xargs -n 1 cp build_resources/.npmrc" > build_resources/publish.sh
echo "cp build_resources/.npmrc ." >> build_resources/publish.sh
echo "pwd" >> build_resources/publish.sh
echo "more build_resources/publish.sh" >> build_resources/publish.sh
echo "npx lerna publish from-package --no-git-reset --no-git-tag-version --no-push --allow-branch build_server* --yes --registry $1 --no-verify-access" >> build_resources/publish.sh

chmod +x build_resources/publish.sh

