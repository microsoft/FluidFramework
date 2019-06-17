# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

FROM node:8

WORKDIR /usr/src/server
RUN pwd .
COPY package-lock.json .
COPY package.json .
RUN npm install
RUN pwd .
COPY . /usr/src/server

CMD npm run build
CMD npm run webpack

EXPOSE 4000

USER node

CMD npm run start
