# Copyright (c) Microsoft Corporation and contributors. All rights reserved.
# Licensed under the MIT License.

ARG NODE_VERSION=24
FROM mcr.microsoft.com/devcontainers/javascript-node:${NODE_VERSION}

# Install Chromium to get .so libraries required for Puppeteer tests.
# (Note that Puppeteer bundles its own version of Chromium, we just need OS dependencies.)
RUN export DEBIAN_FRONTEND=noninteractive \
    && apt-get update \
    && apt-get -y install --no-install-recommends chromium libxss1

# Install additional desired packages here
RUN export DEBIAN_FRONTEND=noninteractive \
    && apt-get update \
    && apt-get -y install --no-install-recommends \
        fd-find \
        jq \
        sqlite3 \
        shellcheck \
        tree \
        vim \
    && ln -s /usr/bin/fdfind /usr/local/bin/fd

# Note: To minimize security risk, please do not install Azure CLI and Github CLI in Github Codespaces.
#       Do feel free to manually install 'gh' and 'az' in local dev containers (see "features" section
#       in devcontainer.json).

# Clean up
RUN apt-get autoremove -y \
    && apt-get clean -y \
    && rm -rf /var/lib/apt/lists/*

# Optionally install Agency tooling for AI-ready codespace configs
ARG AI_READY="false"
RUN if [ "$AI_READY" = "true" ]; then \
        curl -sSfL https://aka.ms/InstallTool.sh | sh -s agency; \
    fi

USER node
