# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

FROM node:12.16.3-slim AS base

# To auth against private VSTS
ARG NPM_TOKEN

# node-gyp dependencies
RUN apt-get update && apt-get install -y \
        python \
        make \
        git \
        curl \
        g++

# Add Tini
ENV TINI_VERSION v0.18.0
ADD https://github.com/krallin/tini/releases/download/${TINI_VERSION}/tini /tini
RUN chmod +x /tini

# Copy over and build the server
WORKDIR /usr/src/server

# Copy over the package and package-lock and install prior to the other code to optimize Docker's file system cache on rebuilds
COPY LICENSE.txt .
COPY package*.json ./
COPY lerna.json .
COPY lerna-package-lock.json .
COPY .npmrc .
COPY .editorconfig .
COPY tsfmt.json .
COPY tools/build-server-resources/build-version.js tools/build-server-resources/

COPY packages/gitresources/package*.json packages/gitresources/
COPY packages/protocol-definitions/package*.json packages/protocol-definitions/
COPY packages/kafka-orderer/package*.json packages/kafka-orderer/
COPY packages/lambdas-driver/package*.json packages/lambdas-driver/
COPY packages/lambdas/package*.json packages/lambdas/
COPY packages/local-server/package*.json packages/local-server/
COPY packages/memory-orderer/package*.json packages/memory-orderer/
COPY packages/routerlicious/package*.json packages/routerlicious/
COPY packages/services/package*.json packages/services/
COPY packages/services-client/package*.json packages/services-client/
COPY packages/services-core/package*.json packages/services-core/
COPY packages/services-utils/package*.json packages/services-utils/
COPY packages/test-utils/package*.json packages/test-utils/
COPY packages/protocol-base/package*.json packages/protocol-base/

# Copy over chaincode npmrc and package.json to dynamically install packages.
COPY chaincode/* /tmp/chaincode/

# Give write permission to node user.
RUN chown -R node:node /tmp/chaincode/
RUN chmod -R 755 /tmp/chaincode/*

# Give node user access to nyc in order to run and store coverage tests. Do this in all packages directory
# as well as the root
RUN for d in ./*/*/ ; do (cd "$d" && mkdir nyc && chown node: nyc); done
RUN mkdir nyc && chown node: nyc

# Expose the port the app runs under
EXPOSE 3000

# Need to set the --unsafe-perm flag since we are doing the install as root. Consider adding an 'app' accout so we
# can do the install as node but then switch to 'app' to run. As app we won't be able to write to installed files
# and be able to change them.
RUN npm install --unsafe-perm

# And now copy over our actual code and build
COPY packages/ packages/

# Switch to the server folder and build
WORKDIR /usr/src/server

# Set the version number
ARG VERSION_BUILDNUMBER=0
ARG VERSION_BUILDBRANCH=refs/heads/unknown
RUN echo VERSION_BUILDNUMBER=$VERSION_BUILDNUMBER
RUN echo VERSION_BUILDBRANCH=$VERSION_BUILDBRANCH
RUN version=`node tools/build-server-resources/build-version.js`; echo $version; npx lerna version $version --no-git-tag-version --no-push --yes
RUN npm run build:ci

# Build that alfred uses
FROM base AS runner

# Don't run as root user
USER node

# Node wasn't designed to be run as PID 1. Tini is a tiny init wrapper. You can also set --init on docker later than
# 1.13 but Kubernetes is at 1.12 so we prefer tini for now.
ENTRYPOINT ["/tini", "--"]

# And set the default command to start the server
CMD ["npm", "run", "alfred"]

# Partial Build Target for publishing
FROM base AS publish

# To auth against private VSTS
ARG NPM_TOKEN

# Webpack components for publishing
RUN npm run webpack

# Node wasn't designed to be run as PID 1. Tini is a tiny init wrapper. You can also set --init on docker later than
# 1.13 but Kubernetes is at 1.12 so we prefer tini for now.
ENTRYPOINT ["/tini", "--"]
