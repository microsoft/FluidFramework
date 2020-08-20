# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

# To build this docker image, run the following command from the root of the repo
# docker build -f .\docs\Dockerfile --target docs -t fluid:docs .

# To get content out of the image, use these commands:
# docker build -f .\docs\Dockerfile --target docs -t fluid:docs --build-arg VUEPRESS_BASE="/versions/0.21/" --build-arg THIS_VERSION=0.21 --build-arg MAIN_BRANCH_VERSION=0.23 --build-arg RELEASE_VERSION=0.22 --build-arg N1_VERSION=0.21 --build-arg BASE_URL="https://fluiddocsstorage.z22.web.core.windows.net" . --no-cache

# 1. create a temporary writeable image
# docker create -ti --name dummy fluid:docs bash

# 2. copy out the docs/dist folder
# docker cp dummy:docs/dist/ docs/

# 3. Remove the temporary image
# docker rm -f dummy

# OR

# docker run --rm -v [local absolute path]:/usr/src/fluid-docs -t fluid:docs cp -R docs/dist/ /usr/src/fluid-docs
# the site will be copied to the local path

# az storage blob upload-batch -s .\dist\ -d `$web --account-name fluiddocsstorage --account-key [key] --destination-path "/versions/0.21/"

# rsync docs/dist/ docker/ -rv --delete --exclude '.git' --exclude 'versions'

FROM node:12.16.1-slim AS base

# dependencies
RUN apt-get update && apt-get install -y \
        git \
        yarn

RUN npm install -g @microsoft/api-documenter@^7.4.6 copyfiles@^2.1.0

#############################
FROM base AS vuepress
# Use pre-release version of vuepress with a perf fix
WORKDIR /
RUN git clone https://github.com/tylerbutler/vuepress.git vuepress

WORKDIR /vuepress
RUN git checkout feat/implement-node-worker-threads
RUN yarn
RUN yarn tsc
RUN yarn boot
RUN yarn register-vuepress

WORKDIR /
RUN mkdir docs

# Copy the root .npmrc to pull private packages
COPY .npmrc docs/
COPY docs/package*.json docs/

WORKDIR /docs
RUN npm ci

# Link the forked version of vuepress
RUN yarn link "vuepress"

#############################
# Copy the source and the api artifact
FROM vuepress AS copysrc

WORKDIR /
COPY . .

# Convert the json to markdown
RUN npm run build:gendocs

#############################
FROM copysrc AS docs

WORKDIR /docs

# Build docs
ARG BASE_URL
ARG VUEPRESS_BASE
ARG MAIN_BRANCH_VERSION
ARG THIS_VERSION
ARG N1_VERSION
ARG RELEASE_VERSION

# write the args into temp files
RUN echo ${BASE_URL} > /root/base_url
RUN echo ${VUEPRESS_BASE} > /root/vuepress_base
# set the environment variable right before running the build
RUN BASE_URL=$(cat /root/base_url); VUEPRESS_BASE=$(cat /root/vuepress_base); npm run build:ci

# We want / to be the working dir when we use the image to extract the built docs
# Without this the working dir is /docs, which doesn't match the local environment
WORKDIR /
