# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

FROM node:12.16-slim AS base

# node-gyp dependencies
RUN apt-get update && apt-get install -y \
        g++ \
        git \
        make \
        python \
        yarn

RUN npm install -g @microsoft/api-documenter@^7.4.6 copyfiles@^2.1.0

#############################
WORKDIR /
RUN mkdir docs

# Copy the root .npmrc to pull private packages
COPY .npmrc docs/
COPY docs/package*.json docs/

WORKDIR /docs
RUN npm ci

#############################
# Copy the source and the api artifact
FROM base AS r11s

WORKDIR /
COPY . .

# Convert the json to markdown
RUN npm run build:gendocs

#############################
FROM r11s AS docs

WORKDIR /docs

# Build docs
RUN npm run build:ci

#############################
FROM docs AS docpublish

WORKDIR /

RUN git config --global user.email "fluidrtdev@microsoft.com"
RUN git config --global user.name "Fluid build server"

ARG DOCSGITPASSWORD
RUN git clone https://%24praguedocs:$DOCSGITPASSWORD@praguedocs.scm.azurewebsites.net:443/praguedocs.git praguedocs
WORKDIR /praguedocs
RUN git pull
WORKDIR /
RUN rsync docs/dist/ praguedocs/ -rv --delete --exclude '.git'

WORKDIR /praguedocs
RUN git add .
RUN git diff --quiet && git diff --staged --quiet || git commit -am 'Automated build'
RUN git push
