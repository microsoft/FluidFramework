FROM node:8.4.0-alpine

RUN apk add --no-cache tini

# Copy over and build the server
WORKDIR /usr/src/server

# Copy over the package and package-lock and install prior to the other code to optimize Docker's file system cache on rebuilds
COPY package-lock.json .
COPY package.json .
RUN npm install

# And now copy over our actual code and build
COPY . .
RUN npm run build:full

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
