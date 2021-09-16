# Copyright (c) Microsoft Corporation and contributors. All rights reserved.
# Licensed under the MIT License.

FROM node:14-slim

ENV FLUID_TEST_LOGGER_PKG_PATH '@fluid-internal/test-app-insights-logger'

RUN apt-get update

RUN apt-get install -y procps jq \
  && apt-get clean

RUN npm update -g

WORKDIR /app

COPY common/ common/
COPY experimental/ experimental/
COPY manifests/ manifests/
COPY packages/ packages/
COPY tools/ tools/
COPY package.json .
COPY package-lock.json .
COPY lerna.json .
COPY lerna-package-lock.json .

RUN npm install

RUN npm run postinstall

RUN npm run build:ci

WORKDIR /app/packages/test/test-service-load
