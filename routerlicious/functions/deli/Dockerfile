FROM node:8.12.0-alpine

RUN apk --no-cache add \
      bash \
      g++ \
      ca-certificates \
      lz4-dev \
      musl-dev \
      cyrus-sasl-dev \
      openssl-dev \
      make \
      python \
      tini

RUN apk add --no-cache --virtual .build-deps gcc zlib-dev libc-dev bsd-compat-headers py-setuptools bash

# Copy over and build the server
WORKDIR /usr/src/server

ARG NPM_TOKEN
COPY .npmrc .
# COPY package-lock.json .
COPY package.json .
RUN npm install

# Remove build tools
RUN apk del .build-deps

COPY . .
RUN npm run build

# Don't run as root user
USER node

# Node wasn't designed to be run as PID 1. Tini is a tiny init wrapper. You can also set --init on docker later than
# 1.13 but Kubernetes is at 1.12 so we prefer tini for now.
ENTRYPOINT ["/sbin/tini", "--"]

# And set the default command to start the server
CMD ["npm", "run", "alfred"]
