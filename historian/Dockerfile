FROM node:8.1.4-alpine

# Install build dependencies needed for native modules
# TODO Further decrease the container size with --virtual .build-deps and remove later
RUN apk add --no-cache \
    make \
    gcc \
    g++ \
    python \
    openssl-dev \
    curl-dev

# Copy over and build the server
COPY . /home/node/server
WORKDIR /home/node/server
RUN npm install
RUN npm run build

# Expose the port the app runs under
EXPOSE 3000

# Switch to the node user for security
USER node

# And set the default command to start the server
CMD ["npm", "start"]
