FROM node:8.11.1-alpine

RUN apk --no-cache add \
      bash \
      g++ \
      ca-certificates \
      lz4-dev \
      musl-dev \
      cyrus-sasl-dev \
      openssl-dev \
      make \
      python

RUN apk add --no-cache --virtual .build-deps gcc zlib-dev libc-dev bsd-compat-headers py-setuptools bash

WORKDIR /usr/local/app

COPY package-lock.json .
COPY package.json .

RUN npm install

COPY . .
RUN npm run build

CMD [ "npm", "run", "start" ]