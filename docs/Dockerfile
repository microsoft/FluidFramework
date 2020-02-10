# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

FROM node:10.16.0-slim AS base

# node-gyp dependencies
RUN apt-get update && apt-get install -y \
        git \
        yarn

RUN npm install -g @microsoft/api-documenter@^7.4.6 copyfiles@^2.1.0

#############################
# Use pre-release version of vuepress with a perf fix
WORKDIR /
RUN git clone https://github.com/vuejs/vuepress.git vuepress
WORKDIR /vuepress
RUN git checkout fix/improve-build-time
#9dce83575a8e798ee29fa8ddedacfdfbbb3e7ac6
RUN yarn
RUN yarn tsc
RUN yarn boot
RUN yarn register-vuepress

#############################
# Copy the source and the api artifact
FROM base AS r11s

WORKDIR /
COPY . .

# Convert the json to markdown
# Temporarily disable this to speed up doc builds
# RUN npm run build:gendocs

#############################
FROM r11s AS docs

WORKDIR /docs

# Copy the root .npmrc to pull private packages
RUN cp ../.npmrc ./.npmrc
RUN npm install
RUN yarn link "vuepress"

# Build
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
RUN rsync docs/dist/ praguedocs/ -rv --exclude '.git'

WORKDIR /praguedocs
RUN git add .
RUN git diff --quiet && git diff --staged --quiet || git commit -am 'Automated build'
RUN git push
