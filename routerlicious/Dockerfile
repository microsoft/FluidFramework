FROM node:8.9.3-alpine

# Blizzard Kafka dependencies
RUN apk --no-cache add \
      bash \
      g++ \
      ca-certificates \
      lz4-dev \
      musl-dev \
      cyrus-sasl-dev \
      openssl-dev \
      make \
      python

RUN apk add --no-cache --virtual .build-deps gcc zlib-dev libc-dev bsd-compat-headers py-setuptools bash

# node-gyp dependencies
RUN apk add --no-cache --virtual .gyp python make g++

# tini so node doesn't run as PID 1 
RUN apk add --no-cache tini python make g++

# Copy over and build the server
WORKDIR /usr/src/server

COPY . .

# Copy over the package and package-lock and install prior to the other code to optimize Docker's file system cache on rebuilds
RUN npm install

RUN rm ./node_modules/node-rdkafka/index.d.ts

# And now copy over our actual code and build
RUN npm run build:full

# Remove build tools
RUN apk del .gyp
RUN apk del .build-deps

# Expose the port the app runs under
EXPOSE 3000

# Give node user access to nyc in order to run unit tests
RUN mkdir nyc
RUN chown node: nyc

# Don't run as root user
USER node

# Node wasn't designed to be run as PID 1. Tini is a tiny init wrapper. You can also set --init on docker later than
# 1.13 but Kubernetes is at 1.12 so we prefer tini for now.
ENTRYPOINT ["/sbin/tini", "--"]

# And set the default command to start the server
CMD ["npm", "run", "alfred"]
