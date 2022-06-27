# Copyright (c) Microsoft Corporation and contributors. All rights reserved.
# Licensed under the MIT License.

# Fluid Development Container based on "docker-from-docker" template:
# https://github.com/microsoft/vscode-dev-containers/blob/master/containers/docker-from-docker/.devcontainer/Dockerfile

ARG NODE_VERSION=12

# 'node:${VARIANT}' base image includes the following:
#
#    eslint (global), node/npm, nvm, yarn
#
# Debian base image includes the following:
#
#    ca-certificates, curl, g++, git, gnupg, libxss1, make, procps, python, wget
#
# (See https://github.com/microsoft/vscode-dev-containers/tree/master/containers/javascript-node/.devcontainer)
FROM mcr.microsoft.com/vscode/devcontainers/javascript-node:${NODE_VERSION}

# Install Chromium to get .so libraries required for Puppeteer tests.
# (Note that Puppeteer bundles its own version of Chromium, we just need OS dependencies.)
RUN export DEBIAN_FRONTEND=noninteractive \
    && apt-get update \
    && apt-get -y install --no-install-recommends chromium libxss1

# Install Docker CLI / Docker-Compose and create '/usr/local/share/docker-init.sh' to proxy the
# docker socket.  (We retrieve the script from the 'docker-from-docker' dev container template)

# [Option] Enable non-root Docker access in container
ARG ENABLE_NONROOT_DOCKER="true"
# [Option] Use the OSS Moby CLI instead of the licensed Docker CLI
ARG USE_MOBY="true"

# A user of "automatic" attempts to reuse an user ID if one already exists.
ARG USERNAME=automatic
ARG USER_UID=1000
ARG USER_GID=$USER_UID

RUN mkdir /tmp/library-scripts
RUN wget -O /tmp/library-scripts/docker-debian.sh https://raw.githubusercontent.com/microsoft/vscode-dev-containers/master/containers/docker-from-docker/.devcontainer/library-scripts/docker-debian.sh
RUN /bin/bash /tmp/library-scripts/docker-debian.sh "${ENABLE_NONROOT_DOCKER}" "/var/run/docker-host.sock" "/var/run/docker.sock" "${USERNAME}" "${USE_MOBY}"
RUN rm -rf /tmp/library-scripts/

# Install additional desired packages here
RUN export DEBIAN_FRONTEND=noninteractive \
    && apt-get -y install --no-install-recommends \
        vim

# Clean up
RUN apt-get autoremove -y \
    && apt-get clean -y \
    && rm -rf /var/lib/apt/lists/*

USER node

# Set '/usr/local/share/docker-init.sh' as entrypoint to proxy Docker socket on start.
ENTRYPOINT ["/usr/local/share/docker-init.sh"]
CMD ["sleep", "infinity"]
