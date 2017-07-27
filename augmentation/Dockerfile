
FROM prague.azurecr.io/editorservicerelay:276197

# Install Node.js
RUN apt-get install --yes curl
RUN curl --silent --location https://deb.nodesource.com/setup_8.x | bash -
RUN apt-get install --yes nodejs
RUN apt-get install --yes build-essential

# Copy over and build the server
COPY . /usr/src/server
WORKDIR /usr/src/server

RUN npm install
RUN npm run build

# Expose the port the app runs under
EXPOSE 5000

# And set the default command to start the server
CMD ["node", "dist/index.js"]
