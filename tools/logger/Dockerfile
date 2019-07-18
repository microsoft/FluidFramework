# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

FROM node:10.16.0-alpine

WORKDIR /usr/src/server
COPY package-lock.json .
COPY package.json .
RUN npm install
COPY . .

RUN npm run build

USER node

ENTRYPOINT [ "node", "dist/ariaLogger.js"]
