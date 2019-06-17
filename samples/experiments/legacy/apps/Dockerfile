# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

FROM node:8.9.3-alpine

# node-gyp dependencies
RUN apk add --no-cache --virtual .gyp python make g++

# tini so node doesn't run as PID 1
RUN apk add --no-cache tini python make g++

# Copy over and build the server
WORKDIR /usr/src/server

# Copy over the package and package-lock and install prior to the other code to optimize Docker's file system cache on rebuilds
ARG NPM_TOKEN
COPY .npmrc .
COPY package-lock.json .
COPY package.json .
RUN npm install

# And now copy over our actual code and build
COPY . .
RUN npm run build

# Remove the npmrc following the build
RUN rm -f .npmrc

# Remove build tools
RUN apk del .gyp

# Expose the port the app runs under
EXPOSE 3000

# Don't run as root user
USER node

# Node wasn't designed to be run as PID 1. Tini is a tiny init wrapper. You can also set --init on docker later than
# 1.13 but Kubernetes is at 1.12 so we prefer tini for now.
ENTRYPOINT ["/sbin/tini", "--"]

# And set the default command to start the server
CMD ["node", "dist/www.js"]
