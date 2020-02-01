# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

FROM node:10.16.0-slim AS base

# node-gyp dependencies
RUN apt-get update && apt-get install -y \
        git

#############################
# Copy the source and the api artifact
FROM base AS r11s

COPY . .

# Convert the json to markdown
WORKDIR /
RUN npm run build:gendocs

#############################
FROM r11s AS docs

WORKDIR /docs
RUN npm install

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
