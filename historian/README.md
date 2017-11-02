# Historian

The historian service tracks the historical record for a document. It serves as a proxy to the underlying git repository
that maintains the versioned snapshots.

## Building and running

For consistency we recommend building and developing within a container

You can build the production container by running.

`docker build -t historian .`

And then mount it for development by running.

`docker run -it -v "$(pwd):/home/node/server" -p 3000:3000 historian /bin/sh`
pwd == echo %cd% in windows... also I had issues with the port #?
`docker run -it -v "$(echo %cd%):/home/node/server" -p 3000:3000 historian /bin/sh`


When mounted for development you'll want to run the following commands. These also work if you would like to
develop outside of the container.

`npm install`
`npm run build`

## Compose

A compose file is also provided which provides a Redis server and a Git REST server. By default it will mount
your local files into the container so you will need to npm install, npm run build prior.

## Testing

`docker run -t historian npm test`
