FROM node:6.9.4-alpine

# Copy over the app source
COPY . /usr/src/server
WORKDIR /usr/src/server

# Install packages and then install the app
RUN npm install -g gulp
RUN npm install
RUN gulp

# Expose the port the app runs under
EXPOSE 3000

# And set the default command to start the server
CMD ["npm", "start"]