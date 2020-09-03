#-------------------------------------------------------------------------------------------------------------
# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License. See https://go.microsoft.com/fwlink/?linkid=2090316 for license information.
#-------------------------------------------------------------------------------------------------------------

ARG NODE_VERSION=12
ARG USERNAME=node

# Base image begins with 'node:${VARIANT}' and adds the following:
#
#    zsh
#    yarn
#    nvm
#    eslint (global)
#
# (See https://github.com/microsoft/vscode-dev-containers/tree/master/containers/javascript-node/.devcontainer)
FROM mcr.microsoft.com/vscode/devcontainers/javascript-node:${NODE_VERSION}

# Avoid warnings by switching to noninteractive
ENV DEBIAN_FRONTEND=noninteractive

# Retrieve script to install Docker CLI / Docker-Compose from the 'Docker-from-Docker' dev container template.

# Configure apt and install packages
RUN apt-get update \
    && apt-get -y install --no-install-recommends apt-utils 2>&1 \

    # Install Fluid build dependencies and developer conveniences.
    #
    # https://jilles.me/badassify-your-terminal-and-shell/
    # https://billgrant.io/post/2019-05-05-vsremote/
    && apt-get install -y \
        curl \
        g++ \
        git \
        make \
        procps \
        python \
        vim \
        wget \
        zsh \

    # Install Docker CLI / Docker-Compose and create 'docker-init.sh' to proxy docker socket.
    # (We retrieve the install script from the 'docker-from-docker' dev container template)
    && mkdir /tmp/library-scripts \
    && curl -o /tmp/library-scripts/docker-debian.sh -sS https://raw.githubusercontent.com/microsoft/vscode-dev-containers/c3214ad7fcf5086e898e3941a36e0171959a48ca/containers/azure-ansible/.devcontainer/library-scripts/docker-debian.sh \
    && /bin/bash /tmp/library-scripts/docker-debian.sh "${ENABLE_NONROOT_DOCKER}" "${SOURCE_SOCKET}" "${TARGET_SOCKET}" "${USERNAME}" \

    # Clean up
    && apt-get autoremove -y \
    && apt-get clean -y \
    && rm -rf /var/lib/apt/lists/* /tmp/library-scripts/

# terminal colors with xterm
ENV TERM xterm

# Switch back to dialog for any ad-hoc use of apt-get
ENV DEBIAN_FRONTEND=dialog

USER node

RUN git clone https://github.com/zsh-users/zsh-syntax-highlighting ${ZSH_CUSTOM:-~/.oh-my-zsh/custom}/plugins/zsh-syntax-highlighting \
    && git clone https://github.com/zsh-users/zsh-autosuggestions ${ZSH_CUSTOM:-~/.oh-my-zsh/custom}/plugins/zsh-autosuggestions

COPY .zshrc /home/node/.zshrc

# Setting the ENTRYPOINT to docker-init.sh will configure non-root access to
# the Docker socket if "overrideCommand": false is set in devcontainer.json.
# The script will also execute CMD if you need to alter startup behaviors.
ENTRYPOINT [ "/usr/local/share/docker-init.sh" ]
CMD [ "sleep", "infinity" ]
