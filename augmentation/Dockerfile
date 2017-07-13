
FROM node:8.1.4-alpine

# Add git since we reference certain npm modules with git
RUN apk update && apk upgrade && apk add --no-cache git

# Copy over and build the server
COPY . /usr/src/server
WORKDIR /usr/src/server
RUN npm install
RUN npm run build

# Expose the port the app runs under
EXPOSE 5000
