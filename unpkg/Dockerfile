FROM node:8.11.1-alpine

RUN apk add --no-cache tini

# Copy over and build the server
WORKDIR /home/node/server
ARG NPM_TOKEN
COPY .npmrc .
COPY package.json .
COPY package-lock.json .
RUN npm install
COPY . .
RUN npm run build

# Remove the npmrc following the build
RUN rm -f .npmrc

# Expose the port the app runs under
EXPOSE 3000

# Give node user access to nyc in order to run unit tests
RUN mkdir nyc
RUN chown node: nyc
USER node

# Node wasn't designed to be run as PID 1. Tini is a tiny init wrapper. You can also set --init on docker later than
# 1.13 but Kubernetes is at 1.12 so we prefer tini for now.
ENTRYPOINT ["/sbin/tini", "--"]

# And set the default command to start the server
CMD ["node", "dist/www.js"]
