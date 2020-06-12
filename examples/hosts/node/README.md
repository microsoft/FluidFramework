# @fluid-example/node-host

## Fluid Loader for Node.js evironment

This example demonstrates loading Fluid components inside Node.js environment. To understand how Fluid loader works, read the [literate](../literate/README.md) loader example first.

## Difference with Literate Loader

The primary difference is how component packages are being loaded. While the literate loader can 'script include' a file inside a browser environment, Node requires a different approach.
It uses 'npm install' to install the package directly in local file system. Once installed, it returns the installed code as an entry point for the loader to invoke.

Note that if you are installing packages from a private registry, you need to create .npmrc file with auth tokens inside your installation directory first.

## Build steps

Replace the following parameters in [index.ts](./src/index.ts)

```
const ordererEndpoint = <fluid_ordering_url>;
const storageEndpoint = <fluid_storage_url>;
const tenantId = <fluid_tenant_id>;
const tenantKey = <fluid_tenant_key>;
const bearerSecret = <fluid_host_secret>;

// Code package details.
const defaultPackage = "@fluid-example/key-value-cache@0.19.0-28557";
const installPath = "/tmp/components"; // Local filesystem path where package will be installed
const timeoutMS = 60000; // Timeout for successful installation

const docId = ""; // Document id (randomly chosen if not specified)
```

Once parameters are set up, use the following commands for building and running:

```bash
npm run build
npm start
```

## Interacting with the component

To demonstrate host interaction inside Node.js environment, this example uses [key-value-cache](https://github.com/microsoft/FluidFramework/tree/master/components/experimental/key-value-cache) component. Using Fluid map, the component builds a highly available eventually consistent key-value cache. In terms of usage, this can be thought as a limited functionality Redis HSET. Services written in Node.js can host this component and use as a cache.

[cli.ts](./src/cli.ts) provides a basic example of interacting with this component using command line inputs.
