# Note that the build of this file is assumed to have happend from the parent directory
FROM node:8.12.0-slim

# node-gyp dependencies
RUN apt-get update && apt-get install -y \
        python \
        make \
        g++

# Add Tini
ENV TINI_VERSION v0.18.0
ADD https://github.com/krallin/tini/releases/download/${TINI_VERSION}/tini /tini
RUN chmod +x /tini

ARG NPM_TOKEN

# Copy over and build the server
# Eventually we can better optimzie this. For now we just copy everything.
WORKDIR /usr/src/server
COPY . .

WORKDIR /usr/src/server/functions
RUN npm install --unsafe-perm
RUN npm run build

# Don't run as root user
USER node

EXPOSE 3000

# Node wasn't designed to be run as PID 1. Tini is a tiny init wrapper. You can also set --init on docker later than
# 1.13 but Kubernetes is at 1.12 so we prefer tini for now.
ENTRYPOINT ["/tini", "--"]

# And set the default command to start the server
CMD ["npm", "run", "alfred"]
