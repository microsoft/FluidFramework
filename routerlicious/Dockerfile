FROM node:8.15.0-slim AS base

# node-gyp dependencies
RUN apt-get update && apt-get install -y \
        python \
        make \
        git \
        curl \
        g++

# Add Tini
ENV TINI_VERSION v0.18.0
ADD https://github.com/krallin/tini/releases/download/${TINI_VERSION}/tini /tini
RUN chmod +x /tini

# Copy over and build the server
WORKDIR /usr/src/server

# Copy over the package and package-lock and install prior to the other code to optimize Docker's file system cache on rebuilds
COPY *.json ./

COPY packages/components/app-component/package*.json packages/components/app-component/
COPY packages/components/app-datastore/package*.json packages/components/app-datastore/
COPY packages/components/app-ui/package*.json packages/components/app-ui/
COPY packages/components/chart-view/package*.json packages/components/chart-view/
COPY packages/components/client-ui/package*.json packages/components/client-ui/
COPY packages/components/flow-document/package*.json packages/components/flow-document/
COPY packages/components/flow-editor/package*.json packages/components/flow-editor/
COPY packages/components/flow-host/package*.json packages/components/flow-host/
COPY packages/components/flow-util/package*.json packages/components/flow-util/
COPY packages/components/table-document/package*.json packages/components/table-document/
COPY packages/components/table-slice/package*.json packages/components/table-slice/
COPY packages/components/table-view/package*.json packages/components/table-view/
COPY packages/drivers/replay-socket-storage/package*.json packages/drivers/replay-socket-storage/
COPY packages/drivers/socket-storage/package*.json packages/drivers/socket-storage/
COPY packages/drivers/socket-storage-shared/package*.json packages/drivers/socket-storage-shared/
COPY packages/drivers/standard-socket-storage/package*.json packages/drivers/standard-socket-storage/
COPY packages/loader/container-definitions/package*.json packages/loader/container-definitions/
COPY packages/loader/container-loader/package*.json packages/loader/container-loader/
COPY packages/loader/gitresources/package*.json packages/loader/gitresources/
COPY packages/loader/loader-web/package*.json packages/loader/loader-web/
COPY packages/loader/utils/package*.json packages/loader/utils/
COPY packages/runtime/api-definitions/package*.json packages/runtime/api-definitions/
COPY packages/runtime/component/package*.json packages/runtime/component/
COPY packages/runtime/cell/package*.json packages/runtime/cell/
COPY packages/runtime/client-api/package*.json packages/runtime/client-api/
COPY packages/runtime/map/package*.json packages/runtime/map/
COPY packages/runtime/merge-tree/package*.json packages/runtime/merge-tree/
COPY packages/runtime/merge-tree-utils/package*.json packages/runtime/merge-tree-utils/
COPY packages/runtime/runtime/package*.json packages/runtime/runtime/
COPY packages/runtime/runtime-definitions/package*.json packages/runtime/runtime-definitions/
COPY packages/runtime/sequence/package*.json packages/runtime/sequence/
COPY packages/runtime/stream/package*.json packages/runtime/stream/
COPY packages/server/agent/package*.json packages/server/agent/
COPY packages/server/kafka-orderer/package*.json packages/server/kafka-orderer/
COPY packages/server/lambdas-driver/package*.json packages/server/lambdas-driver/
COPY packages/server/lambdas/package*.json packages/server/lambdas/
COPY packages/server/local-test-server/package*.json packages/server/local-test-server/
COPY packages/server/memory-orderer/package*.json packages/server/memory-orderer/
COPY packages/server/routerlicious/package*.json packages/server/routerlicious/
COPY packages/server/services/package*.json packages/server/services/
COPY packages/server/services-client/package*.json packages/server/services-client/
COPY packages/server/services-core/package*.json packages/server/services-core/
COPY packages/server/services-utils/package*.json packages/server/services-utils/
COPY packages/shared/test-utils/package*.json packages/shared/test-utils/
COPY packages/shared/tools-core/package*.json packages/shared/tools-core/
    

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
RUN for d in ./packages/*/*/ ; do (cd "$d" && mkdir nyc && chown node: nyc); done
RUN mkdir nyc && chown node: nyc

# And now copy over our actual code and build
COPY . .
RUN npm run build:full

# Partial Build Target for publishing
FROM base AS publish

# Initialize a base repo for Lerna
RUN git init
RUN git config --global user.email "praguertdev@microsoft.com"
RUN git config --global user.name "Prague build server"
RUN git add .
RUN git commit -m "Base commit for Lerna"

# Node wasn't designed to be run as PID 1. Tini is a tiny init wrapper. You can also set --init on docker later than
# 1.13 but Kubernetes is at 1.12 so we prefer tini for now.
ENTRYPOINT ["/tini", "--"]

# Build that alfred uses
FROM base AS runner

# Don't run as root user
USER node

# Switch to the routerlicious folder
WORKDIR /usr/src/server/packages/server/routerlicious

# Node wasn't designed to be run as PID 1. Tini is a tiny init wrapper. You can also set --init on docker later than
# 1.13 but Kubernetes is at 1.12 so we prefer tini for now.
ENTRYPOINT ["/tini", "--"]

# And set the default command to start the server
CMD ["npm", "run", "alfred"]
