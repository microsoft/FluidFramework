# historian

The historian service tracks the historical record for a document. It serves as a proxy to the underlying git repository
that maintains the versioned snapshots.

## Building and running

For consistency we recommend building and developing within a container

You can build the production container by running.

`docker build -t historian .`

And then mount it for development by running.

`docker run -it -v "$(pwd):/home/node/server" -p 3000:3000 node:8.15.0-slim /bin/bash`

When mounted for development you'll want to run the following commands. These also work if you would like to
develop outside of the container.

`npm install`
`npm run build`

Alternatively, for development, start a mounted container using

```shell
npm run start:dev
```

Then, when making changes, to update the running container code use

```shell
npm run build
docker-compose restart historian
```

To run in combination with Routerlicious for easy end-to-end testing
1. Comment out all services in `historian/docker-compose.yml` except for historian, then save.
2. Comment out the historian service within `routerlicious/docker-compose.yml`, then save
2. Start Routerlicious by following instructions within `server/routerlicious/README.md`.
3. Run `npm run start:dev` from historian.

## Compose

A compose file is also provided which provides a Redis server and a Git REST server. By default it will mount
your local files into the container so you will need to npm install, npm run build prior.

## Testing

`docker run -t historian npm test`

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services. Use of these trademarks
or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.
