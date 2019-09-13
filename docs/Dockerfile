# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

FROM node:10.16.0-slim AS base

# node-gyp and docfx dependencies
RUN apt-get update && apt-get install -y \
        git \
        mono-complete \
        wget \
        unzip

# Download DocFX
WORKDIR /docfx
RUN wget https://github.com/dotnet/docfx/releases/download/v2.45/docfx.zip -nv
RUN unzip docfx.zip
WORKDIR /

#############################
# Copy the source and the api artifact
FROM base AS r11s

COPY . .

#############################
FROM r11s AS docs

# Workaround for https://github.com/Microsoft/web-build-tools/issues/1229
WORKDIR /docs/api
RUN sed -i "s/SharePoint Framework reference/API overview/g" toc.yml
RUN sed -i "s/\~\/overview\/sharepoint.md/\~\/api_overview.md/g" toc.yml

# Run DocFX
WORKDIR /docfx
RUN mono docfx.exe build ../docs/docfx.json

#############################
FROM docs AS docpublish

WORKDIR /

RUN git config --global user.email "praguertdev@microsoft.com"
RUN git config --global user.name "Prague build server"

ARG DOCSGITPASSWORD
RUN git clone https://%24praguedocs:$DOCSGITPASSWORD@praguedocs.scm.azurewebsites.net:443/praguedocs.git praguedocs
RUN rsync docs/_site/ praguedocs/ -rv --exclude '.git'

WORKDIR /praguedocs
RUN git add .
RUN git diff --quiet && git diff --staged --quiet || git commit -am 'Automated build'
RUN git push
