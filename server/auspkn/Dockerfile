# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

FROM node:12.16.3-alpine AS base

RUN apk add --no-cache tini

# Copy over and build the server
WORKDIR /home/node/server
COPY package.json .
COPY package-lock.json .
RUN npm install
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
ENTRYPOINT ["/sbin/tini", "--"]

# And set the default command to start the server
CMD ["npm", "start"]
