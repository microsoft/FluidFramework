# @fluidframework/azure-local-service

Azure local service is a minimal, self-contained, test implementation of the Azure Fluid Relay service that can be run locally and used for development/testing Fluid functionality in conjunction with the `AzureClient` in local mode.

## What is this for?

The Azure local service includes most of the basic features needed to **test** data stores and containers. While we use the [Webpack Fluid Loader](../../packages/tools/webpack-fluid-loader)'s in browser service for much of our data store and container development, the Azure local service offers some advantages because it's a standalone process. For instance, testing a Fluid container from 2+ simultaneously connected clients is much easier using the Azure local service.

## Getting Started
You can install, build, and start this service by running the following

```sh
npm i
npm run build
npm run start
```

## Configuration
### Port
The Azure local service uses port 7070 by default.  You can change the port number by setting an environment
variable named PORT to the desired number.  For example:
```sh
$env:PORT=6502
npm run start
```
