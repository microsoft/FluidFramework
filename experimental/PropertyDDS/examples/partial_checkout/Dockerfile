#-------------------------------------------------------------------------------------------------------------
# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License. See https://go.microsoft.com/fwlink/?linkid=2090316 for license information.
#-------------------------------------------------------------------------------------------------------------

# Based on the javascript-node container template here:
# https://github.com/microsoft/vscode-dev-containers/tree/master/containers/javascript-node

ARG NODE_VERSION=12
FROM mcr.microsoft.com/vscode/devcontainers/javascript-node:${NODE_VERSION}

# Install our custom .bashrc for colorized prompt and 'ls'
COPY ./.bashrc /root

# For convenience, install the Rush CLI globally.  Note that the '/bin/rush' script
# automatically installs and caches the versions of rush/pnpm specified in 'rush.json'
# in the project's '/common/temp' folder.  (i.e., the version of the globally installed
# '@microsoft/rush' package doesn't matter.)
RUN bash -ci "npm i -g @microsoft/rush"
