# Copyright (c) Microsoft Corporation and contributors. All rights reserved.
# Licensed under the MIT License.

# DisableDockerDetector "No feasible secure solution for OSS repos yet"

# Use a direct sha256 hash to ensure we are always using the same version of the base image.
# This avoids throttling issues with Docker Hub by using an image baked into the pipeline build image.
FROM node:18.20.5-bookworm-slim@sha256:c4a278056a0f79abf472d912bbf5af6c874126ae450faad9df52069e9ad78335 AS runnerbase

ARG SETVERSION_VERSION=dev
ENV SETVERSION_VERSION=$SETVERSION_VERSION

ARG SETVERSION_CODEVERSION=dev
ENV SETVERSION_CODEVERSION=$SETVERSION_CODEVERSION

ARG INTERDEPENDENCY_RANGE=^
ENV INTERDEPENDENCY_RANGE=$INTERDEPENDENCY_RANGE

ARG RELEASE_GROUP=server
ENV RELEASE_GROUP=$RELEASE_GROUP

ARG BUILD_ROOT=/usr/FluidFramework
ARG ROUTERLICIOUS_ROOT=$BUILD_ROOT/server/routerlicious

# node-gyp dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    python3 \
    make \
    git \
    curl \
    g++ \
    openssl \
    libssl-dev \
    ca-certificates

# Add Tini
ENV TINI_VERSION=v0.18.0
ADD https://github.com/krallin/tini/releases/download/${TINI_VERSION}/tini /tini
RUN chmod +x /tini

FROM runnerbase AS base

# Routerlicious's root release directory has a 'file:' devDependency on this package. Despite it not being used in the docker
# container, we thus copy just the package.json there to ensure this dependency is resolvable. This won't be persisted in the runner image anyway.
WORKDIR $BUILD_ROOT
COPY --from=root packages/tools/changelog-generator-wrapper/package.json packages/tools/changelog-generator-wrapper/

# Copy over and build the server. We use the same directory structure as outside of the docker container to ensure flub works smoothly.
WORKDIR $ROUTERLICIOUS_ROOT

# Copy over the package and package-lock and install prior to the other code to optimize Docker's file system cache on rebuilds
COPY package*.json ./
COPY pnpm*.yaml ./
COPY .npmrc ./
COPY lerna.json ./
COPY scripts/*.* ./scripts/
COPY patches/*.* ./patches/

COPY packages/gitresources/package*.json packages/gitresources/
COPY packages/kafka-orderer/package*.json packages/kafka-orderer/
COPY packages/lambdas-driver/package*.json packages/lambdas-driver/
COPY packages/lambdas/package*.json packages/lambdas/
COPY packages/local-server/package*.json packages/local-server/
COPY packages/memory-orderer/package*.json packages/memory-orderer/
COPY packages/routerlicious/package*.json packages/routerlicious/
COPY packages/routerlicious-base/package*.json packages/routerlicious-base/
COPY packages/services/package*.json packages/services/
COPY packages/services-client/package*.json packages/services-client/
COPY packages/services-core/package*.json packages/services-core/
COPY packages/services-ordering-kafkanode/package*.json packages/services-ordering-kafkanode/
COPY packages/services-ordering-rdkafka/package*.json packages/services-ordering-rdkafka/
COPY packages/services-ordering-zookeeper/package*.json packages/services-ordering-zookeeper/
COPY packages/services-shared/package*.json packages/services-shared/
COPY packages/services-telemetry/package*.json packages/services-telemetry/
COPY packages/services-utils/package*.json packages/services-utils/
COPY packages/test-utils/package*.json packages/test-utils/
COPY packages/protocol-base/package*.json packages/protocol-base/
COPY packages/tinylicious/package*.json packages/tinylicious/

ENV PNPM_HOME="/pnpm"
# Add package dependency's executables to the PATH. We also add global pnpm executables by including $PNPM_HOME,
# though it's not leveraged currently.
ENV PATH="$PNPM_HOME:$ROUTERLICIOUS_ROOT/node_modules/.bin:$PATH"

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

# And now copy over our actual code and build
COPY . .

# Copy over fluid config files to allow flub versioning to work
WORKDIR $BUILD_ROOT
COPY --from=root fluidBuild.config.cjs ./fluidBuild.base.config.cjs
COPY --from=root ./server/routerlicious/fluidBuild.docker.config.cjs fluidBuild.config.cjs
WORKDIR $ROUTERLICIOUS_ROOT
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

RUN pnpm run ci:build

# Build that alfred uses
FROM runnerbase AS runner

WORKDIR /usr/src/server

COPY --from=base $ROUTERLICIOUS_ROOT/node_modules ./node_modules
COPY --from=base $ROUTERLICIOUS_ROOT/packages ./packages

# Expose the port the app runs under
EXPOSE 3000

# Don't run as root user
USER node

# Node wasn't designed to be run as PID 1. Tini is a tiny init wrapper. You can also set --init on docker later than
# 1.13 but Kubernetes is at 1.12 so we prefer tini for now.
ENTRYPOINT ["/tini", "--"]

# And set the default command to start the server
CMD ["npm", "run", "alfred"]
