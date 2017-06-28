FROM node:7.7.4-alpine

# Add git since we reference certain npm modules with git
RUN apk update && apk upgrade && apk add --no-cache git

# Required for access to our dev mode ssh git repo. If we switch to http we can remove
RUN apk add --no-cache openssh 

# Copy over and build the server
COPY . /usr/src/server
WORKDIR /usr/src/server
RUN npm install
RUN npm run build

# Expose the port the app runs under
EXPOSE 3000

# And set the default command to start the server
CMD ["npm", "run", "alfred"]
