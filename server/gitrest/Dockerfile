# Copyright (c) Microsoft Corporation and contributors. All rights reserved.
# Licensed under the MIT License.
# DisableDockerDetector "No feasible secure solution for OSS repos yet"

FROM node:18.20.5-bookworm-slim@sha256:c4a278056a0f79abf472d912bbf5af6c874126ae450faad9df52069e9ad78335 AS runnerbase

ARG SETVERSION_VERSION=dev
ENV SETVERSION_VERSION=$SETVERSION_VERSION

ARG SETVERSION_CODEVERSION=dev
ENV SETVERSION_CODEVERSION=$SETVERSION_CODEVERSION

ARG INTERDEPENDENCY_RANGE=^
ENV INTERDEPENDENCY_RANGE=$INTERDEPENDENCY_RANGE

ARG RELEASE_GROUP=gitrest
ENV RELEASE_GROUP=$RELEASE_GROUP

ARG BUILD_ROOT=/usr/FluidFramework
ARG GITREST_ROOT=$BUILD_ROOT/server/gitrest

# Add Tini
ENV TINI_VERSION=v0.18.0
ADD https://github.com/krallin/tini/releases/download/${TINI_VERSION}/tini /tini
RUN chmod +x /tini

FROM runnerbase AS base

# Copy over and build the server. We use the same directory structure as outside of the docker container to ensure flub works smoothly.
WORKDIR $GITREST_ROOT

COPY package*.json ./
COPY pnpm*.yaml ./
COPY .npmrc ./
COPY lerna.json ./
COPY scripts/*.* ./scripts/
COPY .npmrc ./

COPY packages/gitrest/package*.json packages/gitrest/
COPY packages/gitrest-base/package*.json packages/gitrest-base/

ENV PNPM_HOME="/pnpm"
# Add package dependency's executables to the PATH. We also add global pnpm executables by including $PNPM_HOME,
# though it's not leveraged currently.
ENV PATH="$PNPM_HOME:$GITREST_ROOT/node_modules/.bin:$PATH"

# Note: `npm install -g corepack` was added as a temporary workaround in response to https://github.com/nodejs/corepack/issues/612.
# The NPM registry recently rotated some keys but non-latest corepack versions (like those distributed with Node18)
# have hardcoded references to the old keys and thus fail to install packages that were signed with the new keys.
# So install the latest corepack globally to work around the problem.
RUN npm install -g corepack && corepack enable

# Need to set the --unsafe-perm flag since we are doing the install as root. Consider adding an 'app' account so we
# can do the install as node but then switch to 'app' to run. As app we won't be able to write to installed files
# and be able to change them.
# Using a cache mount for the pnpm store improves the incremental docker build.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store\
    pnpm install --unsafe-perm

COPY . .

# Copy over fluid config files to allow flub versioning to work
WORKDIR $BUILD_ROOT
COPY --from=root fluidBuild.config.cjs ./fluidBuild.base.config.cjs
COPY --from=root ./server/gitrest/fluidBuild.docker.config.cjs fluidBuild.config.cjs
WORKDIR $GITREST_ROOT
ENV _FLUID_ROOT_=$BUILD_ROOT
COPY --from=root /scripts/update-package-version.sh ./scripts/update-package-version.sh
RUN chmod +x ./scripts/update-package-version.sh
RUN set -eu;\
if [ "$SETVERSION_VERSION" != "dev" ]; then\
    echo "Setting package version: $SETVERSION_VERSION";\
    ./scripts/update-package-version.sh;\
else\
    echo "Skipping package version for dev build.";\
fi

RUN pnpm run build

# Build that actually runs
FROM runnerbase AS runner

WORKDIR /home/node/server

COPY --from=base $GITREST_ROOT/node_modules ./node_modules
COPY --from=base $GITREST_ROOT/packages ./packages

# Expose the port the app runs under
EXPOSE 3000

# GITHUB#162
# To allow for ssh access to the repo (to clone locally) we share the volume within a k8s pod with a ssh service.
# Mounted volumes with non-root users get tricky in this case. For now simply running as root for simplicity but
# ideally the node user could gain write permissions to this volume.
# Switch to the node user for security
# USER node

# Node wasn't designed to be run as PID 1. Tini is a tiny init wrapper. You can also set --init on docker later than
# 1.13 but Kubernetes is at 1.12 so we prefer tini for now.
ENTRYPOINT ["/tini", "--"]

# And set the default command to start the server
CMD ["node", "packages/gitrest/dist/www.js"]
