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
echo "@fluidframework:registry=$1" >> build_resources/.npmrc
echo "@microsoft:registry=$1" >> build_resources/.npmrc
echo "@fluid-internal:registry=$1" >> build_resources/.npmrc
echo "@fluid-example:registry=$1" >> build_resources/.npmrc
echo "always-auth=true" >> build_resources/.npmrc
