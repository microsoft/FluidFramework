FROM node:8.9.3-alpine

WORKDIR /usr/src/server
COPY package-lock.json .
COPY package.json .
RUN npm install
COPY . /usr/src/server

RUN mkdir dist
# RUN chown node: dist

RUN npm run build

USER node

ENTRYPOINT [ "node", "dist/ariaLogger.js"]
