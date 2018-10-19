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
COPY packages/app-ui/package*.json packages/app-ui/
COPY packages/api-definitions/package*.json packages/api-definitions/
COPY packages/cell/package*.json packages/cell/
COPY packages/client-api/package*.json packages/client-api/
COPY packages/client-ui/package*.json packages/client-ui/
COPY packages/gitresources/package*.json packages/gitresources/
COPY packages/loader/package*.json packages/loader/
COPY packages/loader-client/package*.json packages/loader-client/
COPY packages/loader-web/package*.json packages/loader-web/
COPY packages/map/package*.json packages/map/
COPY packages/merge-tree/package*.json packages/merge-tree/
COPY packages/merge-tree-utils/package*.json packages/merge-tree-utils/
COPY packages/routerlicious/package*.json packages/routerlicious/
COPY packages/runtime-definitions/package*.json packages/runtime-definitions/
COPY packages/services-client/package*.json packages/services-client/
COPY packages/shared-string/package*.json packages/shared-string/
COPY packages/socket-storage/package*.json packages/socket-storage/
COPY packages/socket-storage-shared/package*.json packages/socket-storage-shared/
COPY packages/replay-socket-storage/package*.json packages/replay-socket-storage/
COPY packages/sharepoint-socket-storage/package*.json packages/sharepoint-socket-storage/
COPY packages/store/package*.json packages/store/
COPY packages/stream/package*.json packages/stream/
COPY packages/utils/package*.json packages/utils/

# Need to set the --unsafe-perf flag since we are doing the install as root. Consider adding an 'app' accout so we
# can do the install as node but then switch to 'app' to run. As app we won't be able to write to installed files
# and be able to change them.
RUN npm install --unsafe-perm

# Expose the port the app runs under
EXPOSE 3000

# Give node user access to nyc in order to run and store coverage tests. Do this in all packages directory
# as well as the root
RUN for d in ./packages/*/ ; do (cd "$d" && mkdir nyc && chown node: nyc); done
RUN mkdir nyc && chown node: nyc

# Remove build tools
RUN apk del .gyp

# And now copy over our actual code and build
COPY . .
RUN npm run build:full

# Don't run as root user
USER node

# Switch to the routerlicious folder
WORKDIR /usr/src/server/packages/routerlicious

# Node wasn't designed to be run as PID 1. Tini is a tiny init wrapper. You can also set --init on docker later than
# 1.13 but Kubernetes is at 1.12 so we prefer tini for now.
ENTRYPOINT ["/sbin/tini", "--"]

# And set the default command to start the server
CMD ["npm", "run", "alfred"]
