FROM node:8.11.4-alpine

# node-gyp dependencies
RUN apk add --no-cache --virtual .gyp python make g++

# tini so node doesn't run as PID 1 
RUN apk add --no-cache tini python make g++

# Copy over and build the server
WORKDIR /usr/src/server

# Copy over the package and package-lock and install prior to the other code to optimize Docker's file system cache on rebuilds
COPY *.json ./
COPY packages/agent/package*.json packages/agent/
COPY packages/client-api/package*.json packages/client-api/
COPY packages/client-ui/package*.json packages/client-ui/
COPY packages/gitresources/package*.json packages/gitresources/
COPY packages/routerlicious/package*.json packages/routerlicious/

# Need to set the --unsafe-perf flag since we are doing the install as root. Consider adding an 'app' accout so we
# can do the install as node but then switch to 'app' to run. As app we won't be able to write to installed files
# and be able to change them.
RUN npm install --unsafe-perm

# Expose the port the app runs under
EXPOSE 3000

# Give node user access to nyc in order to run unit tests
RUN mkdir nyc
RUN chown node: nyc

# Remove build tools
RUN apk del .gyp

# And now copy over our actual code and build
COPY . .
RUN npm run build

# Don't run as root user
USER node

# Switch to the routerlicious folder
WORKDIR /usr/src/server/packages/routerlicious

# Node wasn't designed to be run as PID 1. Tini is a tiny init wrapper. You can also set --init on docker later than
# 1.13 but Kubernetes is at 1.12 so we prefer tini for now.
ENTRYPOINT ["/sbin/tini", "--"]

# And set the default command to start the server
CMD ["npm", "run", "alfred"]
