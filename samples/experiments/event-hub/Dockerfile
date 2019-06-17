# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

FROM ubuntu

RUN  apt-get update -qqy \
  && apt-get install -y --no-install-recommends \
     build-essential \
     node-gyp \
     nodejs-dev \
     libssl1.0-dev \
     liblz4-dev \
     libpthread-stubs0-dev \
     libsasl2-dev \
     libsasl2-modules \
     make \
     python \
     nodejs npm ca-certificates \
  && rm -rf /var/cache/apt/* /var/lib/apt/lists/*

WORKDIR /usr/local/app

COPY package-lock.json .
COPY package.json .

RUN npm install -d
ENV LD_LIBRARY_PATH=/usr/src/app/node_modules/node-rdkafka/build/deps

COPY . .
RUN npm run build

CMD [ "npm", "run", "start" ]