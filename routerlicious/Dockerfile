FROM node:8.14.0-slim

# node-gyp dependencies
RUN apt-get update && apt-get install -y \
        python \
        make \
        g++

# Add Tini
ENV TINI_VERSION v0.18.0
ADD https://github.com/krallin/tini/releases/download/${TINI_VERSION}/tini /tini
RUN chmod +x /tini

# Copy over and build the server
WORKDIR /usr/src/server

# Copy over the package and package-lock and install prior to the other code to optimize Docker's file system cache on rebuilds
COPY *.json ./
COPY packages/agent/package*.json packages/agent/
COPY packages/api-definitions/package*.json packages/api-definitions/
COPY packages/app-component/package*.json packages/app-component/
COPY packages/app-datastore/package*.json packages/app-datastore/
COPY packages/app-ui/package*.json packages/app-ui/
COPY packages/cell/package*.json packages/cell/
COPY packages/chart-view/package*.json packages/chart-view/
COPY packages/client-api/package*.json packages/client-api/
COPY packages/client-ui/package*.json packages/client-ui/
COPY packages/flow-app/package*.json packages/flow-app/
COPY packages/flow-document/package*.json packages/flow-document/
COPY packages/flow-editor/package*.json packages/flow-editor/
COPY packages/flow-host/package*.json packages/flow-host/
COPY packages/flow-util/package*.json packages/flow-util/
COPY packages/gitresources/package*.json packages/gitresources/
COPY packages/kafka-orderer/package*.json packages/kafka-orderer/
COPY packages/lambdas-driver/package*.json packages/lambdas-driver/
COPY packages/lambdas/package*.json packages/lambdas/
COPY packages/loader/package*.json packages/loader/
COPY packages/loader-client/package*.json packages/loader-client/
COPY packages/loader-web/package*.json packages/loader-web/
COPY packages/local-test-server/package*.json packages/local-test-server/
COPY packages/map/package*.json packages/map/
COPY packages/memory-orderer/package*.json packages/memory-orderer/
COPY packages/merge-tree/package*.json packages/merge-tree/
COPY packages/merge-tree-utils/package*.json packages/merge-tree-utils/
COPY packages/replay-socket-storage/package*.json packages/replay-socket-storage/
COPY packages/routerlicious/package*.json packages/routerlicious/
COPY packages/runtime-definitions/package*.json packages/runtime-definitions/
COPY packages/sequence/package*.json packages/sequence/
COPY packages/services/package*.json packages/services/
COPY packages/services-client/package*.json packages/services-client/
COPY packages/services-core/package*.json packages/services-core/
COPY packages/services-utils/package*.json packages/services-utils/
COPY packages/socket-storage/package*.json packages/socket-storage/
COPY packages/socket-storage-shared/package*.json packages/socket-storage-shared/
COPY packages/standard-socket-storage/package*.json packages/standard-socket-storage/
COPY packages/stream/package*.json packages/stream/
COPY packages/table-document/package*.json packages/table-document/
COPY packages/table-view/package*.json packages/table-view/
COPY packages/test-utils/package*.json packages/test-utils/
COPY packages/tools-core/package*.json packages/tools-core/
COPY packages/utils/package*.json packages/utils/

# Copy over chaincode npmrc and package.json to dynamically install packages.
COPY chaincode/* /tmp/chaincode/

# Give write permission to node user.
RUN chown -R node:node /tmp/chaincode/
RUN chmod -R 755 /tmp/chaincode/*

# Need to set the --unsafe-perm flag since we are doing the install as root. Consider adding an 'app' accout so we
# can do the install as node but then switch to 'app' to run. As app we won't be able to write to installed files
# and be able to change them.
RUN npm install --unsafe-perm

# Expose the port the app runs under
EXPOSE 3000

# Give node user access to nyc in order to run and store coverage tests. Do this in all packages directory
# as well as the root
RUN for d in ./packages/*/ ; do (cd "$d" && mkdir nyc && chown node: nyc); done
RUN mkdir nyc && chown node: nyc

# And now copy over our actual code and build
COPY . .
RUN npm run build:full

# Don't run as root user
USER node

# Switch to the routerlicious folder
WORKDIR /usr/src/server/packages/routerlicious

# Node wasn't designed to be run as PID 1. Tini is a tiny init wrapper. You can also set --init on docker later than
# 1.13 but Kubernetes is at 1.12 so we prefer tini for now.
ENTRYPOINT ["/tini", "--"]

# And set the default command to start the server
CMD ["npm", "run", "alfred"]
