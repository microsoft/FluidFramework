# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

FROM node:10.16.0-slim AS base

# node-gyp and mono 6 dependencies
RUN apt-get update && apt-get install -y \
        apt-transport-https \
        ca-certificates \
        dirmngr \
        git \
        gnupg \
        unzip \
        wget

# Install mono 6
RUN apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys 3FA7E0328081BFF6A14DA29AA6A19B38D3D831EF
RUN echo "deb https://download.mono-project.com/repo/debian stable-stretch main" | tee /etc/apt/sources.list.d/mono-official-stable.list

RUN apt-get update && apt-get install -y mono-complete

# Download DocFX
WORKDIR /docfx
RUN wget https://github.com/dotnet/docfx/releases/download/v2.45.1/docfx.zip -nv
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
