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

# Optionally install Playwright CLI for AI agent workflows
ARG INSTALL_PLAYWRIGHT_CLI=false
RUN if [ "$INSTALL_PLAYWRIGHT_CLI" = "true" ]; then npm install -g @playwright/cli@latest; fi

ARG INSTALL_AGENCY=false
RUN if [ "$INSTALL_AGENCY" = "true" ]; then \
        su node -c 'export HOME=/home/node; curl -sSfL https://aka.ms/InstallTool.sh | sh -s agency'; \
    fi

# Add agency to PATH for all shells; use POSIX case syntax to avoid duplicate entries.
# /etc/profile.d/ covers bash/sh login shells; /etc/zsh/zshenv covers zsh (all invocation types).
# Also hook into bash interactive shells via /etc/bash/bashrc.d or /etc/bash.bashrc as a fallback.
RUN printf '%s\n' \
    'case ":${PATH}:" in' \
    '    *":$HOME/.config/agency/CurrentVersion:"*) ;;' \
    '    *) export PATH="$HOME/.config/agency/CurrentVersion:${PATH}" ;;' \
    'esac' \
    > /etc/profile.d/agency.sh \
    && chmod +x /etc/profile.d/agency.sh \
    && mkdir -p /etc/zsh \
    && cp /etc/profile.d/agency.sh /etc/zsh/zshenv \
    && if [ -d /etc/bash/bashrc.d ]; then \
           cp /etc/profile.d/agency.sh /etc/bash/bashrc.d/agency.sh; \
       elif [ -f /etc/bash.bashrc ]; then \
           if ! grep -q 'agency/CurrentVersion' /etc/bash.bashrc; then \
               { printf '\n# Add agency to PATH if installed\n'; cat /etc/profile.d/agency.sh; } >> /etc/bash.bashrc; \
           fi; \
       fi

USER node
