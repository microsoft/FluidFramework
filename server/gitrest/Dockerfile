# Copyright (c) Microsoft Corporation and contributors. All rights reserved.
# Licensed under the MIT License.
# DisableDockerDetector "No feasible secure solution for OSS repos yet"

FROM node:18.17.1-buster-slim@sha256:cb2a746612c2564d3bd0f871174618337af9d0f4d895df6a623fd7a69ca6e5bd AS base

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

COPY packages/gitrest/package*.json packages/gitrest/
COPY packages/gitrest-base/package*.json packages/gitrest-base/

RUN corepack enable

# Need to set the --unsafe-perm flag since we are doing the install as root. Consider adding an 'app' accout so we
# can do the install as node but then switch to 'app' to run. As app we won't be able to write to installed files
# and be able to change them.
# Needs to set --no-frozen-lockfile since npmrc requires it if there are resolution changes, and the package dependencies don't exactly match
RUN pnpm install --unsafe-perm --no-frozen-lockfile

COPY . .
RUN npm run build

# Build that actually runs
FROM base AS runner

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
