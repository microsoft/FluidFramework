# Would prefer alpine for size - but prebuilt nodegit has dependency issues with Alpine
# https://github.com/nodegit/nodegit/issues/1361. So trading the larger base image for simplicity.
FROM node:8.9.1

# Node wasn't designed to be run as PID 1. Tini is a tiny init wrapper. You can also set --init on docker later than
# 1.13 but Kubernetes is at 1.12 so we prefer tini for now.
ENV TINI_VERSION v0.16.1
ADD https://github.com/krallin/tini/releases/download/${TINI_VERSION}/tini /tini
RUN chmod +x /tini
ENTRYPOINT ["/tini", "--"]

# Copy over and build the server
WORKDIR /home/node/server
COPY package.json /home/node/server
COPY package-lock.json /home/node/server
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

# And set the default command to start the server
CMD ["node", "dist/www.js"]
