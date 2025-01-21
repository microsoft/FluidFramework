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

ARG RELEASE_GROUP=historian
ENV RELEASE_GROUP=$RELEASE_GROUP

ARG BUILD_ROOT=/usr/FluidFramework
ARG HISTORIAN_ROOT=$BUILD_ROOT/server/historian

# node-gyp dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    git \
    curl \
    g++

# Add Tini
ENV TINI_VERSION=v0.18.0
ADD https://github.com/krallin/tini/releases/download/${TINI_VERSION}/tini /tini
RUN chmod +x /tini

FROM runnerbase AS base

# Copy over and build the server. We use the same directory structure as outside of the docker container to ensure flub works smoothly.
WORKDIR $HISTORIAN_ROOT

COPY package*.json ./
COPY pnpm*.yaml ./
COPY .npmrc ./
COPY lerna.json ./
COPY scripts/*.* ./scripts/
COPY .npmrc ./

COPY packages/historian/package.json packages/historian/
COPY packages/historian-base/package.json packages/historian-base/

ENV PNPM_HOME="/pnpm"
# Add package dependency's executables to the PATH. We also add global pnpm executables by including $PNPM_HOME,
# though it's not leveraged currently.
ENV PATH="$PNPM_HOME:$HISTORIAN_ROOT/node_modules/.bin:$PATH"
RUN corepack enable

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
COPY --from=root ./server/historian/fluidBuild.docker.config.cjs fluidBuild.config.cjs
WORKDIR $HISTORIAN_ROOT
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

COPY --from=base $HISTORIAN_ROOT/node_modules ./node_modules
COPY --from=base $HISTORIAN_ROOT/packages ./packages

# Expose the port the app runs under
EXPOSE 3000

# Don't run as root user
USER node

# Node wasn't designed to be run as PID 1. Tini is a tiny init wrapper. You can also set --init on docker later than
# 1.13 but Kubernetes is at 1.12 so we prefer tini for now.
ENTRYPOINT ["/tini", "--"]

# And set the default command to start the server
CMD ["node", "packages/historian/dist/www.js"]
