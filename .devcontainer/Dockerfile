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
        bubblewrap \
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

# Optionally configure agency PATH for all shells (must run as root, before USER node).
# /etc/profile.d/ covers bash/sh login shells; /etc/zsh/zshrc.d or /etc/zsh/zshrc covers
# interactive zsh shells; /etc/bash/bashrc.d or /etc/bash.bashrc covers interactive bash shells.
# The -d guard ensures PATH is only modified when agency is actually installed.
ARG INSTALL_AGENCY=false
RUN if [ "$INSTALL_AGENCY" = "true" ]; then printf '%s\n' \
    'if [ -d "$HOME/.config/agency/CurrentVersion" ]; then' \
    '    case ":${PATH}:" in' \
    '        *":$HOME/.config/agency/CurrentVersion:"*) ;;' \
    '        *) export PATH="$HOME/.config/agency/CurrentVersion:${PATH}" ;;' \
    '    esac' \
    'fi' \
    > /etc/profile.d/agency.sh \
    && chmod +x /etc/profile.d/agency.sh \
    && if [ -d /etc/bash/bashrc.d ]; then \
           cp /etc/profile.d/agency.sh /etc/bash/bashrc.d/agency.sh; \
       elif [ -f /etc/bash.bashrc ]; then \
           if ! grep -q 'agency/CurrentVersion' /etc/bash.bashrc; then \
               { printf '\n# Add agency to PATH if installed\n'; cat /etc/profile.d/agency.sh; } >> /etc/bash.bashrc; \
           fi; \
       fi \
    && if [ -d /etc/zsh/zshrc.d ]; then \
           cp /etc/profile.d/agency.sh /etc/zsh/zshrc.d/agency.sh; \
       elif [ -f /etc/zsh/zshrc ]; then \
           if ! grep -q 'agency/CurrentVersion' /etc/zsh/zshrc; then \
               { printf '\n'; cat /etc/profile.d/agency.sh; } >> /etc/zsh/zshrc; \
           fi; \
       fi; \
    fi

USER node

# Ensure user-local install paths are on PATH for tools installed below
ENV PATH="/home/node/.local/bin:/home/node/.cargo/bin:${PATH}"

# Optionally install Playwright CLI
ARG INSTALL_PLAYWRIGHT_CLI=false
RUN if [ "$INSTALL_PLAYWRIGHT_CLI" = "true" ]; then npm install -g @playwright/cli@latest; fi

# Optionally install agency (installs to $HOME/.config/agency, must run as node user)
RUN if [ "$INSTALL_AGENCY" = "true" ]; then curl --proto '=https' --tlsv1.2 -fsSL https://aka.ms/InstallTool.sh | sh -s agency; fi

# Optionally install repoverlay
ARG INSTALL_REPOVERLAY=false
RUN if [ "$INSTALL_REPOVERLAY" = "true" ]; then curl --proto '=https' --tlsv1.2 -LsSf https://github.com/tylerbutler/repoverlay/releases/latest/download/repoverlay-installer.sh | sh; fi
