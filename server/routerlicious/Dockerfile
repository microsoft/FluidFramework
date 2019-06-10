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
COPY .npmrc .

COPY packages/agents/intelligence-runner/package*.json packages/agents/intelligence-runner/
COPY packages/agents/snapshotter/package*.json packages/agents/snapshotter/
COPY packages/agents/spellchecker/package*.json packages/agents/spellchecker/
COPY packages/agents/translator/package*.json packages/agents/translator/
COPY packages/components/agent-scheduler/package*.json packages/components/agent-scheduler/
COPY packages/components/app-component/package*.json packages/components/app-component/
COPY packages/components/app-datastore/package*.json packages/components/app-datastore/
COPY packages/components/app-ui/package*.json packages/components/app-ui/
COPY packages/components/charts/package*.json packages/components/charts/
COPY packages/components/chart-view/package*.json packages/components/chart-view/
COPY packages/components/client-ui/package*.json packages/components/client-ui/
COPY packages/components/progress-bars/package*.json packages/components/progress-bars/
COPY packages/components/flow-document/package*.json packages/components/flow-document/
COPY packages/components/flow-editor/package*.json packages/components/flow-editor/
COPY packages/components/flow-host/package*.json packages/components/flow-host/
COPY packages/components/flow-page/package*.json packages/components/flow-page/
COPY packages/components/flow-scroll/package*.json packages/components/flow-scroll/
COPY packages/components/flow-util/package*.json packages/components/flow-util/
COPY packages/components/key-value/package*.json packages/components/key-value/
COPY packages/components/math/package*.json packages/components/math/
COPY packages/components/monaco/package*.json packages/components/monaco/
COPY packages/components/owned-map/package*.json packages/components/owned-map/
COPY packages/components/pinpoint-editor/package*.json packages/components/pinpoint-editor/
COPY packages/components/shared-text/package*.json packages/components/shared-text/
COPY packages/components/table-document/package*.json packages/components/table-document/
COPY packages/components/table-test/package*.json packages/components/table-test/
COPY packages/components/table-view/package*.json packages/components/table-view/
COPY packages/drivers/odsp-socket-storage/package*.json packages/drivers/odsp-socket-storage/
COPY packages/drivers/sharepoint-socket-storage/package*.json packages/drivers/sharepoint-socket-storage/
COPY packages/drivers/replay-socket-storage/package*.json packages/drivers/replay-socket-storage/
COPY packages/drivers/file-socket-storage/package*.json packages/drivers/file-socket-storage/
COPY packages/drivers/routerlicious-host/package*.json packages/drivers/routerlicious-host/
COPY packages/drivers/routerlicious-socket-storage/package*.json packages/drivers/routerlicious-socket-storage/
COPY packages/drivers/socket-storage-shared/package*.json packages/drivers/socket-storage-shared/
COPY packages/framework/framework-definitions/package*.json packages/framework/framework-definitions/
COPY packages/loader/container-definitions/package*.json packages/loader/container-definitions/
COPY packages/loader/container-loader/package*.json packages/loader/container-loader/
COPY packages/loader/gitresources/package*.json packages/loader/gitresources/
COPY packages/loader/loader-web/package*.json packages/loader/loader-web/
COPY packages/loader/utils/package*.json packages/loader/utils/
COPY packages/runtime/shared-object-common/package*.json packages/runtime/shared-object-common/
COPY packages/runtime/component-runtime/package*.json packages/runtime/component-runtime/
COPY packages/runtime/consensus-ordered-collection/package*.json packages/runtime/consensus-ordered-collection/
COPY packages/runtime/consensus-register-collection/package*.json packages/runtime/consensus-register-collection/
COPY packages/runtime/cell/package*.json packages/runtime/cell/
COPY packages/runtime/client-api/package*.json packages/runtime/client-api/
COPY packages/runtime/map/package*.json packages/runtime/map/
COPY packages/runtime/merge-tree/package*.json packages/runtime/merge-tree/
COPY packages/runtime/container-runtime/package*.json packages/runtime/container-runtime/
COPY packages/runtime/runtime-definitions/package*.json packages/runtime/runtime-definitions/
COPY packages/runtime/sequence/package*.json packages/runtime/sequence/
COPY packages/runtime/stream/package*.json packages/runtime/stream/
COPY packages/server/agent/package*.json packages/server/agent/
COPY packages/server/gateway/package*.json packages/server/gateway/
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
COPY packages/utils/odsp-utils/package*.json packages/utils/odsp-utils/
COPY packages/utils/build-common/package*.json packages/utils/build-common/
COPY packages/server/test-utils/package*.json packages/server/test-utils/
COPY packages/server/tools-core/package*.json packages/server/tools-core/
COPY packages/tools/prague-dump/package*.json packages/tools/prague-dump/
COPY packages/tools/replay-tool/package*.json packages/tools/replay-tool/

# Copy over chaincode npmrc and package.json to dynamically install packages.
COPY server/routerlicious/chaincode/* /tmp/chaincode/

# Give write permission to node user.
RUN chown -R node:node /tmp/chaincode/
RUN chmod -R 755 /tmp/chaincode/*

# Give node user access to nyc in order to run and store coverage tests. Do this in all packages directory
# as well as the root
RUN for d in ./*/*/ ; do (cd "$d" && mkdir nyc && chown node: nyc); done
RUN mkdir nyc && chown node: nyc

# Expose the port the app runs under
EXPOSE 3000

# Need to set the --unsafe-perm flag since we are doing the install as root. Consider adding an 'app' accout so we
# can do the install as node but then switch to 'app' to run. As app we won't be able to write to installed files
# and be able to change them.
RUN npm install --unsafe-perm

# And now copy over our actual code and build
COPY .gitignore .
COPY packages/ packages/
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
