[![Historian Build Status](https://offnet.visualstudio.com/_apis/public/build/definitions/0a22f611-6a4a-4416-a1bb-53ed7284aa21/7/badge)](https://offnet.visualstudio.com/officenet/_build/index?definitionId=7)

# Historian

The historian service tracks the historical record for a document. It serves as a proxy to the underlying git repository
that maintains the versioned snapshots.

## Building and running

For consistency we recommend building and developing within a container

To begin you'll need to connect to the Fluid private npm repository. Instructions can be found [here](../routerlicious/README.md#authorizing-to-private-npm-feed)

You can build the production container by running.

`docker build --build-arg NPM_TOKEN=${NPM_TOKEN} -t historian .`

And then mount it for development by running.

`docker run -it -v "$(pwd):/home/node/server" -e NPM_TOKEN=${NPM_TOKEN} -p 3000:3000 node:8.15.0-slim /bin/bash`

When mounted for development you'll want to run the following commands. These also work if you would like to
develop outside of the container.

`npm install`
`npm run build`

## Compose

A compose file is also provided which provides a Redis server and a Git REST server. By default it will mount
your local files into the container so you will need to npm install, npm run build prior.

## Testing

`docker run -t historian npm test`
