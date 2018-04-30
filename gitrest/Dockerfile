FROM node:8.11.1-alpine

RUN apk --no-cache add tini
RUN apk --no-cache add gcc libc-dev libressl-dev
RUN apk --no-cache add make python curl-dev g++

# Copy over and build the server
WORKDIR /home/node/server
ARG NPM_TOKEN
COPY .npmrc .
COPY package.json .
COPY package-lock.json .
RUN BUILD_ONLY=true npm install
COPY . .
RUN npm run build

# Remove the npmrc following the build
RUN rm -f .npmrc

# Expose the port the app runs under
EXPOSE 3000

# GITHUB#162
# To allow for ssh access to the repo (to clone locally) we share the volume within a k8s pod with a ssh service.
# Mounted volumes with non-root users get tricky in this case. For now simply running as root for simplicity but
# ideally the node user could gain write permissions to this volume.
# Switch to the node user for security
# USER node

# Node wasn't designed to be run as PID 1. Tini is a tiny init wrapper. You can also set --init on docker later than
# 1.13 but Kubernetes is at 1.12 so we prefer tini for now.
ENTRYPOINT ["/sbin/tini", "--"]

# And set the default command to start the server
CMD ["node", "dist/www.js"]
