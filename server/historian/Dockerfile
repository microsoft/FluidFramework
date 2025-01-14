# Copyright (c) Microsoft Corporation and contributors. All rights reserved.
# Licensed under the MIT License.

# DisableDockerDetector "No feasible secure solution for OSS repos yet"

FROM node:18.17.1-bookworm-slim@sha256:cb2a746612c2564d3bd0f871174618337af9d0f4d895df6a623fd7a69ca6e5bd AS base

# node-gyp dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    git \
    curl \
    g++

# Add Tini
ENV TINI_VERSION v0.18.0
ADD https://github.com/krallin/tini/releases/download/${TINI_VERSION}/tini /tini
RUN chmod +x /tini

# Copy over and build the server
WORKDIR /home/node/server

COPY package*.json ./
COPY pnpm*.yaml ./
COPY scripts/*.* ./scripts/
COPY .npmrc ./

COPY packages/historian/package.json packages/historian/
COPY packages/historian-base/package.json packages/historian-base/

RUN corepack enable

# Need to set the --unsafe-perm flag since we are doing the install as root. Consider adding an 'app' account so we
# can do the install as node but then switch to 'app' to run. As app we won't be able to write to installed files
# and be able to change them.
# TODO: AB#26779: This Workaround (passing --no-frozen-lockfile) should be removed when possible.
RUN pnpm install --unsafe-perm --no-frozen-lockfile

COPY . .
RUN npm run build

# Build that actually runs
FROM base AS runner

# Expose the port the app runs under
EXPOSE 3000

# Don't run as root user
USER node

# Node wasn't designed to be run as PID 1. Tini is a tiny init wrapper. You can also set --init on docker later than
# 1.13 but Kubernetes is at 1.12 so we prefer tini for now.
ENTRYPOINT ["/tini", "--"]

# And set the default command to start the server
CMD ["node", "packages/historian/dist/www.js"]
