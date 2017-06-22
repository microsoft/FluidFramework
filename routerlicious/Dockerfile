FROM node:7.7.4-alpine

# Add git since we reference certain npm modules with git
RUN apk update && apk upgrade && apk add --no-cache git

# Copy over and build the server
COPY . /usr/src/server
WORKDIR /usr/src/server
RUN npm install
RUN npm run build

# Install python library and dependencies
RUN apk add --update python py-pip
RUN pip install -r src/ml/deps.txt

# Expose the port the app runs under
EXPOSE 3000

# And set the default command to start the server
CMD ["npm", "run", "alfred"]
