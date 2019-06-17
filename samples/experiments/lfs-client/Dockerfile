# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

FROM node:8.11.1-alpine

WORKDIR /usr/local/app

COPY package-lock.json .
COPY package.json .

RUN npm install

COPY . .
RUN npm run build
