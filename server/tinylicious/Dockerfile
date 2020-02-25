# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

FROM node:12.13.1-slim

# node-gyp dependencies
RUN apt-get update && apt-get install -y \
        python \
        make \
        git \
        curl \
        g++

# Add Tini - this is not ARM happy
ENV TINI_VERSION v0.18.0
ENV TINI_PLATFORM tini
ADD https://github.com/krallin/tini/releases/download/${TINI_VERSION}/${TINI_PLATFORM} /tini
RUN chmod +x /tini

# Copy over and build the server
WORKDIR /usr/src/server

# Copy over the package and package-lock and install prior to the other code to optimize Docker's file system cache on rebuilds
COPY .npmrc .
COPY package.json .
COPY package-lock.json .

# Need to set the --unsafe-perm flag since we are doing the install as root. Consider adding an 'app' accout so we
# can do the install as node but then switch to 'app' to run. As app we won't be able to write to installed files
# and be able to change them.
RUN npm install

# Expose the port the app runs under
EXPOSE 3000

# And now copy over our actual code and build
COPY . .

# And build
RUN npm run tsc

RUN mkdir /var/lib/tinylicious && chown node:node /var/lib/tinylicious
RUN mkdir /var/lib/db && chown node:node /var/lib/db

# Don't run as root user
USER node

# Node wasn't designed to be run as PID 1. Tini is a tiny init wrapper. You can also set --init on docker later than
# 1.13 but Kubernetes is at 1.12 so we prefer tini for now.
ENTRYPOINT ["/tini", "--"]

# And set the default command to start the server
CMD ["npm", "start"]
