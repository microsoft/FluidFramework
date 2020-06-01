# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

FROM node:12.16.3-slim

# To auth against private VSTS
ARG NPM_TOKEN

# Add Tini
ENV TINI_VERSION v0.18.0
ADD https://github.com/krallin/tini/releases/download/${TINI_VERSION}/tini /tini
RUN chmod +x /tini

# Copy over and build the server
WORKDIR /usr/src/server
COPY .npmrc .
COPY package.json .
COPY package-lock.json .
RUN npm install

# Copy over chaincode npmrc and package.json to dynamically install packages
# from a private registry. Currently we are not supporting private regstries
# COPY chaincode/* /tmp/components/

# Give write permission to node user for installing dynamic packages
RUN chown -R node:node /tmp/components/
RUN chmod -R 755 /tmp/components/*

COPY . .
RUN npm run build

# Remove the npmrc following the build
RUN rm -f .npmrc

USER node

# Node wasn't designed to be run as PID 1. Tini is a tiny init wrapper. You can also set --init on docker later than
# 1.13 but Kubernetes is at 1.12 so we prefer tini for now.
ENTRYPOINT ["/tini", "--"]

# And set the default command to start the server
CMD ["node", "dist/index.js"]
