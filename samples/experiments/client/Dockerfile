# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

FROM node:8.11.1-alpine

# tini so node doesn't run as PID 1 
RUN apk add --no-cache tini

# Copy over and build the server
WORKDIR /usr/src/server

# And now copy over our actual code and build
COPY . .
RUN npm run build

# Expose the port the app runs under
EXPOSE 3000

# Don't run as root user
USER node

# Node wasn't designed to be run as PID 1. Tini is a tiny init wrapper. You can also set --init on docker later than
# 1.13 but Kubernetes is at 1.12 so we prefer tini for now.
ENTRYPOINT ["/sbin/tini", "--"]

# And set the default command to start the server
CMD ["npm", "run", "server"]
