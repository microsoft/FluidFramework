# Copyright (c) Microsoft Corporation and contributors. All rights reserved.
# Licensed under the MIT License.

# DisableDockerDetector "No feasible secure solution for OSS repos yet"

# Use a direct sha256 hash to ensure we are always using the same version of the base image.
# This avoids throttling issues with Docker Hub by using an image baked into the pipeline build image.
FROM node:18.20.5-bookworm-slim@sha256:c4a278056a0f79abf472d912bbf5af6c874126ae450faad9df52069e9ad78335 AS base

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
ENV TINI_VERSION v0.18.0
ADD https://github.com/krallin/tini/releases/download/${TINI_VERSION}/tini /tini
RUN chmod +x /tini

# There are some packages outside the routerlicious folder that we need to build, so we copy the package to the /usr directory
WORKDIR /usr
COPY --from=root packages/tools/changelog-generator-wrapper/package*.json packages/tools/changelog-generator-wrapper/

# Copy over and build the server
WORKDIR /usr/src/server

# Copy over the package and package-lock and install prior to the other code to optimize Docker's file system cache on rebuilds
COPY package*.json ./
COPY pnpm*.yaml ./
COPY scripts/*.* ./scripts/
COPY .npmrc ./
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

RUN corepack enable

# Need to set the --unsafe-perm flag since we are doing the install as root. Consider adding an 'app' account so we
# can do the install as node but then switch to 'app' to run. As app we won't be able to write to installed files
# and be able to change them.
# TODO: AB#26779: This Workaround (passing --no-frozen-lockfile) should be removed when possible.
RUN pnpm install --unsafe-perm --no-frozen-lockfile

# And now copy over our actual code and build
COPY . .

# Switch to the server folder and build
WORKDIR /usr/src/server
RUN npm run ci:build

# Build that alfred uses
FROM base AS runner

# Expose the port the app runs under
EXPOSE 3000

# Don't run as root user
USER node

# Node wasn't designed to be run as PID 1. Tini is a tiny init wrapper. You can also set --init on docker later than
# 1.13 but Kubernetes is at 1.12 so we prefer tini for now.
ENTRYPOINT ["/tini", "--"]

# And set the default command to start the server
CMD ["npm", "run", "alfred"]
