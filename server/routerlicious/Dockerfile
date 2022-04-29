# Copyright (c) Microsoft Corporation and contributors. All rights reserved.
# Licensed under the MIT License.

FROM node:14.19.1-stretch-slim AS base

# node-gyp dependencies
RUN apt-get update && apt-get install -y \
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

# Copy over and build the server
WORKDIR /usr/src/server

# Copy over the package and package-lock and install prior to the other code to optimize Docker's file system cache on rebuilds
COPY package*.json ./
COPY lerna.json .
COPY lerna-package-lock.json .

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


# Need to set the --unsafe-perm flag since we are doing the install as root. Consider adding an 'app' accout so we
# can do the install as node but then switch to 'app' to run. As app we won't be able to write to installed files
# and be able to change them.
RUN npm install --unsafe-perm

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
