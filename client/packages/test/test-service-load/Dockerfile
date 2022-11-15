# Copyright (c) Microsoft Corporation and contributors. All rights reserved.
# Licensed under the MIT License.

# DisableDockerDetector "No feasible secure solution for OSS repos yet"

# Build doesn't work with node 16
FROM node:14-slim

# Use app insights logger
ENV FLUID_TEST_LOGGER_PKG_PATH '@fluid-internal/test-app-insights-logger'

RUN apt-get update

# Install module to get processess through ps-node package
RUN apt-get install -y procps jq \
    && apt-get clean

RUN npm update -g

# Root dir
WORKDIR /app

# Copy only required code
COPY common/ common/
COPY experimental/ experimental/
COPY packages/ packages/
COPY tools/ tools/
COPY package.json .
COPY package-lock.json .
COPY lerna.json .
COPY lerna-package-lock.json .

# Install and build. Explicit postinstall is required for node 14.
RUN npm install
RUN npm run postinstall
RUN npm run build:ci

# Change to load test dir
WORKDIR /app/packages/test/test-service-load

# Since logger is not static dependency, link it.
RUN npm link ../test-app-insights-logger/
