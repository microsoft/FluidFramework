# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

FROM node:12.16.1-slim AS base

# node-gyp dependencies
RUN apt-get update && apt-get install -y \
        g++ \
        git \
        make \
        python \
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
ARG VUEPRESS_BASE
ARG MASTER_BRANCH_VERSION
ARG THIS_VERSION
ARG N1_VERSION
ARG RELEASE_VERSION

# write the arg into a temp file
RUN echo ${VUEPRESS_BASE} > /root/vuepress_base
# set the environment variable right before running the build
RUN VUEPRESS_BASE=$(cat /root/vuepress_base); npm run build:ci

#############################
FROM docs AS docpublish

WORKDIR /

RUN git config --global user.email "fluidrtdev@microsoft.com"
RUN git config --global user.name "Fluid build server"

ARG DOCSGITPASSWORD
RUN git clone https://%24fluid-docs:$DOCSGITPASSWORD@fluid-docs.scm.azurewebsites.net:443/fluid-docs.git repo

WORKDIR /
ARG VUEPRESS_BASE
RUN mkdir repo${VUEPRESS_BASE} -p -v

WORKDIR /repo
RUN git pull

WORKDIR /
RUN rsync docs/dist/ repo${VUEPRESS_BASE} -rv --delete --exclude '.git' --exclude 'versions'

WORKDIR /repo
RUN git add .
RUN git diff --quiet && git diff --staged --quiet || git commit -am 'Automated build'
RUN git push

#############################
FROM docpublish AS publishroot

WORKDIR /repo
RUN git pull
WORKDIR /
RUN rsync docs/dist/ repo/ -rv --delete --exclude '.git' --exclude 'versions'
