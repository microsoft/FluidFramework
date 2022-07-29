# Copyright (c) Microsoft Corporation and contributors. All rights reserved.
# Licensed under the MIT License.
# DisableDockerDetector "No feasible secure solution for OSS repos yet"

FROM node:14.19.1-stretch AS base

# Add Tini
ENV TINI_VERSION v0.18.0
ADD https://github.com/krallin/tini/releases/download/${TINI_VERSION}/tini /tini
RUN chmod +x /tini

RUN apt-get update && apt-get install -y \
    build-essential \
    libssl-dev \
    python3 \
    libcurl4-openssl-dev

# Copy over and build the server
WORKDIR /home/node/server

COPY package*.json ./
COPY lerna.json .
COPY lerna-package-lock.json .

COPY packages/gitrest/package*.json packages/gitrest/
COPY packages/gitrest-base/package*.json packages/gitrest-base/

RUN npm install --unsafe-perm
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
