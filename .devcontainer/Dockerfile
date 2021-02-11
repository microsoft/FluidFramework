#-------------------------------------------------------------------------------------------------------------
# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License. See https://go.microsoft.com/fwlink/?linkid=2090316 for license information.
#-------------------------------------------------------------------------------------------------------------

ARG NODE_VERSION=12

# 'node:${VARIANT}' base image includes the following:
#
#    eslint (global), node/npm, nvm, yarn, zsh (+ oh-my-zsh)
#
# Debian base image includes the following:
#
#    curl, g++, git, make, procps, python, wget
#
# (See https://github.com/microsoft/vscode-dev-containers/tree/master/containers/javascript-node/.devcontainer)
FROM mcr.microsoft.com/vscode/devcontainers/javascript-node:${NODE_VERSION}

# Install Docker CLI / Docker-Compose and create '/usr/local/share/docker-init.sh' to proxy the
# docker socket.  (We retrieve the script from the 'docker-from-docker' dev container template)
RUN mkdir /tmp/library-scripts \
    && curl -o /tmp/library-scripts/docker-debian.sh -sS https://raw.githubusercontent.com/microsoft/vscode-dev-containers/c3214ad7fcf5086e898e3941a36e0171959a48ca/containers/azure-ansible/.devcontainer/library-scripts/docker-debian.sh \
    && /bin/bash /tmp/library-scripts/docker-debian.sh "${ENABLE_NONROOT_DOCKER}" "${SOURCE_SOCKET}" "${TARGET_SOCKET}" "node" \
    && rm -rf /tmp/library-scripts/

# Update package information before install dependencies
RUN apt-get update

# Install .so libraries required for Puppeteer tests
RUN export DEBIAN_FRONTEND=noninteractive \
    && apt-get -y install --no-install-recommends \
        libpangocairo-1.0-0 \
        libxi6 \
        libatk-bridge2.0-0 \
        libgtk-3-0 \
        libasound2 \
        libatk1.0-0 \
        libcups2 \
        libnss3 \
        libx11-6 \
        libx11-xcb1 \
        libxcomposite1 \
        libxcursor1 \
        libxdamage1 \
        libxext6 \
        libxrandr2 \
        libxss1 \
        libxtst6

# Install additional desired packages here
RUN export DEBIAN_FRONTEND=noninteractive \
    && apt-get -y install --no-install-recommends \
        vim

# Clean up
RUN apt-get autoremove -y \
    && apt-get clean -y \
    && rm -rf /var/lib/apt/lists/*

USER node

# Install ZSH extensions (see https://jilles.me/badassify-your-terminal-and-shell/)
RUN git clone https://github.com/zsh-users/zsh-syntax-highlighting ${ZSH_CUSTOM:-~/.oh-my-zsh/custom}/plugins/zsh-syntax-highlighting \
    && git clone https://github.com/zsh-users/zsh-autosuggestions ${ZSH_CUSTOM:-~/.oh-my-zsh/custom}/plugins/zsh-autosuggestions

# Copy our custom .zshrc to user's home directory
COPY .zshrc /home/node/.zshrc
