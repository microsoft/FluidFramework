FROM node:12.19-slim AS base

# The context doesn't matter so just use the .github folder
# docker build -f ./build-env-perf-testing.dockerfile ./.github/ --target yarn

RUN apt-get update && apt-get upgrade -y
RUN apt-get install -y \
    git \
    time

FROM base AS clone

WORKDIR /usr/src
RUN npm install -g pnpm
RUN mkdir yarn
RUN mkdir pnpm
RUN mkdir main
RUN git clone https://github.com/tylerbutler/FluidFramework main/FluidFramework
WORKDIR /usr/src/main/FluidFramework
RUN git checkout build/pnpm
RUN git checkout build/yarn
RUN git checkout main
WORKDIR /usr/src
RUN git clone ./main/FluidFramework ./pnpm/FluidFramework
RUN git clone ./main/FluidFramework ./yarn/FluidFramework

###############################
# FROM clone AS main

# WORKDIR /usr/src/main/FluidFramework
# RUN time npm install --unsafe-perm

# WORKDIR /usr/src/main
# RUN git clone FluidFramework FluidFramework2
# WORKDIR /usr/src/main/FluidFramework2
# RUN time npm install --unsafe-perm

# WORKDIR /usr/src/main
# RUN git clone FluidFramework FluidFramework3
# WORKDIR /usr/src/main/FluidFramework3
# RUN time npm install --unsafe-perm

###############################
FROM clone AS pnpm

WORKDIR /usr/src/pnpm/FluidFramework
RUN git checkout build/pnpm
RUN time pnpm install

WORKDIR /usr/src/pnpm
RUN git clone FluidFramework FluidFramework2
WORKDIR /usr/src/pnpm/FluidFramework2
RUN git rev-parse --abbrev-ref HEAD
RUN time pnpm install

WORKDIR /usr/src/pnpm
RUN git clone FluidFramework FluidFramework3
WORKDIR /usr/src/pnpm/FluidFramework3
RUN git rev-parse --abbrev-ref HEAD
RUN time pnpm install

###############################
FROM clone AS yarn

WORKDIR /usr/src/yarn/FluidFramework
RUN git checkout build/yarn
RUN time yarn install

WORKDIR /usr/src/yarn
RUN git clone FluidFramework FluidFramework2
WORKDIR /usr/src/yarn/FluidFramework2
RUN git rev-parse --abbrev-ref HEAD
RUN time yarn install

WORKDIR /usr/src/yarn
RUN git clone FluidFramework FluidFramework3
WORKDIR /usr/src/yarn/FluidFramework3
RUN git rev-parse --abbrev-ref HEAD
RUN time yarn install
