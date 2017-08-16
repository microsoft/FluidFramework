FROM node:8.4.0-alpine

# Install build dependencies needed for native modules
# TODO Further decrease the container size with --virtual .build-deps and remove later
RUN apk add --no-cache \
    make \
    gcc \
    g++ \
    python \
    openssl-dev \
    curl-dev

RUN apk add --no-cache tini

# Copy over and build the server
WORKDIR /home/node/server
COPY package.json /home/node/server
RUN npm install
COPY . .
RUN npm run build

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
