# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

FROM node:10.16.0-alpine

# node-gyp dependencies
RUN apk add --no-cache --virtual .gyp python make g++

RUN apk add --no-cache tini

# Copy over and build the server
WORKDIR /home/node/server
ARG NPM_TOKEN
COPY .npmrc .
COPY package.json .
COPY package-lock.json .
RUN npm install

# Remove build tools
RUN apk del .gyp

COPY . .
RUN npm run build

# Remove the npmrc following the build
RUN rm -f .npmrc

# Expose the port the app runs under
EXPOSE 3000

# Run as node user
USER node

# Node wasn't designed to be run as PID 1. Tini is a tiny init wrapper. You can also set --init on docker later than
# 1.13 but Kubernetes is at 1.12 so we prefer tini for now.
ENTRYPOINT ["/sbin/tini", "--"]

# And set the default command to start the server
CMD ["npm", "start"]
