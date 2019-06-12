FROM node:8.15.0-slim AS base

# node-gyp and docfx dependencies
RUN apt-get update && apt-get install -y \
        python \
        make \
        git \
        curl \
        g++ \
        mono-complete \
        wget \
        unzip

# Download DocFX
WORKDIR /docfx
RUN wget https://github.com/dotnet/docfx/releases/download/v2.42.4/docfx.zip -nv
RUN unzip docfx.zip
WORKDIR /

# Install api-documenter
RUN npm install -g @microsoft/api-documenter@^7.2.1

#############################
FROM base AS r11s

COPY . .

# Need to set the --unsafe-perm flag since we are doing the install as root. Consider adding an 'app' accout so we
# can do the install as node but then switch to 'app' to run. As app we won't be able to write to installed files
# and be able to change them.
RUN npm install --unsafe-perm

RUN npm run build:compile

#############################
FROM r11s AS docs

# Build docs; runs both api-extractor and api-documenter
RUN npm run build:docs

# Workaround for https://github.com/Microsoft/web-build-tools/issues/1229
WORKDIR /docs/api
RUN sed "1,3d" toc.yml > tmpfile; mv tmpfile toc.yml

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
