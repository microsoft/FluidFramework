# Copyright (c) Microsoft Corporation and contributors. All rights reserved.
# Licensed under the MIT License.

# DisableDockerDetector "No feasible secure solution for OSS repos yet"

# The node base image is pulled from public Docker Hub by default so local builds and external
# contributors get the canonical upstream image. Our CI pipeline overrides BASE_IMAGE_REGISTRY to
# point at our mirror ACR, because 1ES network isolation policies (CfsClean/CfsClean2) block egress
# to registry-1.docker.io from our build pool. The mirror is byte-for-byte identical to
# docker.io/library, so the same manifest digest pin resolves correctly against either registry.
# See tools/pipelines/README.md for how to maintain the mirror (upgrades, additions).
ARG BASE_IMAGE_REGISTRY=docker.io
FROM ${BASE_IMAGE_REGISTRY}/library/node:22.22.2-bookworm-slim@sha256:f3a68cf41a855d227d1b0ab832bed9749469ef38cf4f58182fb8c893bc462383 AS runnerbase

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

# Debian package mirror. Defaults to the public Debian CDN so local and external-contributor builds
# work unchanged. CI overrides APT_MIRROR to point at our own Debian mirror to reduce reliance on
# third-party package feeds. The mirror is a drop-in that serves the main, updates, and security
# suites. See tools/pipelines/README.md.
ARG APT_MIRROR=deb.debian.org
RUN if [ "$APT_MIRROR" != "deb.debian.org" ]; then \
        find /etc/apt -type f \( -name '*.list' -o -name '*.sources' \) \
            -exec sed -i "s/deb.debian.org/$APT_MIRROR/g; s/security.debian.org/$APT_MIRROR/g" {} +; \
    fi

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
COPY --from=root /scripts/only-pnpm.cjs $BUILD_ROOT/scripts/only-pnpm.cjs
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

# Install the pnpm version pinned in package.json's "packageManager" field.
# Mirrors the approach used by tools/pipelines/templates/include-install-pnpm.yml.
#
# CI has no egress to registry.npmjs.org under 1ES network isolation, so it
# provides an authenticated .npmrc (pointing at our ADO npm mirror) as a
# BuildKit secret. The mount is marked required=false so local `docker build`
# invocations that don't pass --secret still work, falling back to npm's
# default public registry.
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc,required=false \
    PNPM_VERSION=$(node -e "const p=require('./package.json');console.log(p.packageManager.split('+')[0])") \
    && npm install -g "$PNPM_VERSION"

# Forward any pnpm trust policy overrides from the host environment.
# This is needed because tools/pipelines/templates/include-install-pnpm.yml uses these options to work around CI package mirror limitations.
ARG PNPM_CONFIG_TRUST_POLICY
ARG PNPM_CONFIG_MINIMUM_RELEASE_AGE

# Using a cache mount for the pnpm store improves the incremental docker build.
# pnpm's default storeDir is $PNPM_HOME/store when PNPM_HOME is set
# (https://pnpm.io/settings#storedir), so the mount target /pnpm/store already
# matches and no --store-dir flag is needed.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    --mount=type=secret,id=npmrc,target=/root/.npmrc,required=false \
    pnpm install

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
