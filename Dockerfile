FROM node:6.9.4-alpine

# Add git since we reference certain npm modules with git
RUN apk update && apk upgrade && apk add --no-cache git

# Install gulp for building services
RUN npm install -g gulp

# Copy over and build ot-ink
COPY ./ot-ink /usr/src/ot-ink
WORKDIR /usr/src/ot-ink
RUN npm install
RUN gulp

# Copy over and build the server
COPY ./server /usr/src/server
WORKDIR /usr/src/server
RUN npm install
RUN gulp

# Expose the port the app runs under
EXPOSE 3000
EXPOSE 5858

# And set the default command to start the server
CMD ["npm", "start"]
