# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

FROM node:10.16.0-slim AS base

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
COPY LICENSE.txt .
COPY *.json ./
COPY .npmrc .
COPY tools/build-server-resources/build-version.js tools/build-server-resources/

COPY packages/agents/flow-intel/package*.json packages/agents/flow-intel/
COPY packages/agents/flow-intel-viewer/package*.json packages/agents/flow-intel-viewer/
COPY packages/agents/intelligence-runner/package*.json packages/agents/intelligence-runner/
COPY packages/agents/snapshotter/package*.json packages/agents/snapshotter/
COPY packages/agents/spellchecker/package*.json packages/agents/spellchecker/
COPY packages/agents/translator/package*.json packages/agents/translator/
COPY packages/components/agent-scheduler/package*.json packages/components/agent-scheduler/
COPY packages/components/blob-manager/package*.json packages/components/blob-manager/
COPY packages/components/canvas/package*.json packages/components/canvas/
COPY packages/components/clicker/package*.json packages/components/clicker/
COPY packages/components/client-ui/package*.json packages/components/client-ui/
COPY packages/components/external-component-loader/package*.json packages/components/external-component-loader/
COPY packages/components/image-collection/package*.json packages/components/image-collection/
COPY packages/components/pond/package*.json packages/components/pond/
COPY packages/components/progress-bars/package*.json packages/components/progress-bars/
COPY packages/components/shared-map-visualizer/package*.json packages/components/shared-map-visualizer/
COPY packages/components/video-players/package*.json packages/components/video-players/
COPY packages/components/flow-scroll/package*.json packages/components/flow-scroll/
COPY packages/components/flow-util/package*.json packages/components/flow-util/
COPY packages/components/key-value/package*.json packages/components/key-value/
COPY packages/components/markflow/package*.json packages/components/markflow/
COPY packages/components/math/package*.json packages/components/math/
COPY packages/components/monaco/package*.json packages/components/monaco/
COPY packages/components/owned-map/package*.json packages/components/owned-map/
COPY packages/components/pinpoint-editor/package*.json packages/components/pinpoint-editor/
COPY packages/components/scoreboard/package*.json packages/components/scoreboard/
COPY packages/components/scribe/package*.json packages/components/scribe/
COPY packages/components/shared-text/package*.json packages/components/shared-text/
COPY packages/components/search-menu/package*.json packages/components/search-menu/
COPY packages/components/source-document/package*.json packages/components/source-document/
COPY packages/components/table-document/package*.json packages/components/table-document/
COPY packages/components/table-test/package*.json packages/components/table-test/
COPY packages/components/table-view/package*.json packages/components/table-view/
COPY packages/components/todo/package*.json packages/components/todo/
COPY packages/components/webflow/package*.json packages/components/webflow/
COPY packages/drivers/odsp-socket-storage/package*.json packages/drivers/odsp-socket-storage/
COPY packages/drivers/replay-socket-storage/package*.json packages/drivers/replay-socket-storage/
COPY packages/drivers/fluid-debugger/package*.json packages/drivers/fluid-debugger/
COPY packages/drivers/file-socket-storage/package*.json packages/drivers/file-socket-storage/
COPY packages/drivers/routerlicious-host/package*.json packages/drivers/routerlicious-host/
COPY packages/drivers/routerlicious-socket-storage/package*.json packages/drivers/routerlicious-socket-storage/
COPY packages/drivers/iframe-socket-storage/package*.json packages/drivers/iframe-socket-storage/
COPY packages/drivers/socket-storage-shared/package*.json packages/drivers/socket-storage-shared/
COPY packages/drivers/office-urlresolver/package*.json packages/drivers/office-urlresolver/
COPY packages/drivers/odsp-urlResolver/package*.json packages/drivers/odsp-urlResolver/
COPY packages/drivers/fluidapp-odsp-urlResolver/package*.json packages/drivers/fluidapp-odsp-urlResolver/
COPY packages/drivers/routerlicious-urlResolver/package*.json packages/drivers/routerlicious-urlResolver/
COPY packages/framework/aqueduct/package*.json packages/framework/aqueduct/
COPY packages/framework/aqueduct-react/package*.json packages/framework/aqueduct-react/
COPY packages/framework/framework-definitions/package*.json packages/framework/framework-definitions/
COPY packages/loader/component-core-interfaces/package*.json packages/loader/component-core-interfaces/
COPY packages/loader/container-definitions/package*.json packages/loader/container-definitions/
COPY packages/loader/container-loader/package*.json packages/loader/container-loader/
COPY packages/loader/gitresources/package*.json packages/loader/gitresources/
COPY packages/loader/loader-web/package*.json packages/loader/loader-web/
COPY packages/loader/protocol-definitions/package*.json packages/loader/protocol-definitions/
COPY packages/loader/utils/package*.json packages/loader/utils/
COPY packages/hosts/base-host/package*.json packages/hosts/base-host/
COPY packages/hosts/host-service-interfaces/package*.json packages/hosts/host-service-interfaces/
COPY packages/hosts/tiny-web-host/package*.json packages/hosts/tiny-web-host/
COPY packages/hosts/react-web-host/package*.json packages/hosts/react-web-host/
COPY packages/runtime/shared-object-common/package*.json packages/runtime/shared-object-common/
COPY packages/runtime/component-runtime/package*.json packages/runtime/component-runtime/
COPY packages/runtime/consensus-ordered-collection/package*.json packages/runtime/consensus-ordered-collection/
COPY packages/runtime/consensus-register-collection/package*.json packages/runtime/consensus-register-collection/
COPY packages/runtime/cell/package*.json packages/runtime/cell/
COPY packages/runtime/client-api/package*.json packages/runtime/client-api/
COPY packages/runtime/ink/package*.json packages/runtime/ink/
COPY packages/runtime/map/package*.json packages/runtime/map/
COPY packages/runtime/merge-tree/package*.json packages/runtime/merge-tree/
COPY packages/runtime/container-runtime/package*.json packages/runtime/container-runtime/
COPY packages/runtime/runtime-definitions/package*.json packages/runtime/runtime-definitions/
COPY packages/runtime/runtime-test-utils/package*.json packages/runtime/runtime-test-utils/
COPY packages/runtime/sequence/package*.json packages/runtime/sequence/
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
COPY packages/test/snapshots/package*.json packages/test/snapshots/
COPY packages/tools/fluid-fetch/package*.json packages/tools/fluid-fetch/
COPY packages/tools/replay-tool/package*.json packages/tools/replay-tool/
COPY packages/tools/webpack-component-loader/package*.json packages/tools/webpack-component-loader/
COPY packages/tools/merge-tree-client-replay/package*.json packages/tools/merge-tree-client-replay/

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
COPY packages/ packages/

# Set the version number
ARG VERSION_BUILDNUMBER=0
RUN echo $VERSION_BUILDNUMBER
RUN version=`node tools/build-server-resources/build-version.js`; echo $version; npx lerna version $version --no-git-tag-version --no-push --yes
RUN npm run build:ci

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

# Partial Build Target for publishing
FROM base AS publish

# Webpack components for publishing
RUN npm run webpack

# Node wasn't designed to be run as PID 1. Tini is a tiny init wrapper. You can also set --init on docker later than
# 1.13 but Kubernetes is at 1.12 so we prefer tini for now.
ENTRYPOINT ["/tini", "--"]

