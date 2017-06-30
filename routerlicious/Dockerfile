FROM node:7.7.4-alpine

# Add git since we reference certain npm modules with git
RUN apk update && apk upgrade && apk add --no-cache git

# Required for access to our dev mode ssh git repo. If we switch to http we can remove
# The .ssh/config prevents needed to accept the fingerprint at the interactive shell. Not the most secure thing to do
# but it is limited to the container. We can remove once we get to http and/or github
RUN apk add --no-cache openssh
RUN mkdir ~/.ssh
RUN echo -e "Host git\n\tStrictHostKeyChecking no" >> ~/.ssh/config
RUN mkdir /var/lib/prague

# Copy over and build the server
COPY . /usr/src/server
WORKDIR /usr/src/server
RUN npm install
RUN npm run build

# Expose the port the app runs under
EXPOSE 3000

# And set the default command to start the server
CMD ["npm", "run", "alfred"]
