FROM node:8.11.1-alpine

WORKDIR /usr/local/app

COPY package-lock.json .
COPY package.json .

RUN npm install

COPY . .
RUN npm run build
