---
uid: loaders
---

# Fluid Loader for Node.js evironment
This example demonstrates loading Fluid components inside Node.js environment. To understand how Fluid loader works, read the [literate](../literate/README.md) loader example first.

## Difference with Literate Loader
The primary difference is how component packages are being loaded. While the literate loader can 'script include' a file inside a browser environment, Node requires a different approach.
It uses 'npm install' to install the package directly in local file system. Once installed, it returns the installation folder as an entry point for the loader to invoke.

Note that if you are installing packages from a private registry, you need to create .npmrc file with auth tokens inside your installation directory.

## Parameters
```
const ordererEndpoint = <fluid_ordering_url>;
const storageEndpoint = <fluid_storage_url>;
const tenantId = <fluid_tenant_id>;
const tenantKey = <fluid_tenant_key>;
const bearerSecret = <fluid_host_secret>;

// Code package details.
const defaultPackage = "@fluid-example/key-value-cache@0.19.0-28557";
const installPath = "/tmp/components"; // Local filesystem path
const timeoutMS = 60000; // Timeout for successful installation

const docId = ""; // Document id (randomly chosen if not specified)
```

## Build steps
Once parameters are set up, run the following command to build and run:

```bash
npm run build
npm start
```

## Interacting with the component
This example uses [key-value-cache](https://github.com/microsoft/FluidFramework/tree/master/components/experimental/key-value-cache) component to demonstrate interaction with a component in Node.js environment. The component is an eventually consistent key-value cache built on top of Fluid map. You can think this as a limited functionality Redis HSET with eventual consistency guarantee.

If you are loading the same component, you can interact with it using a limited set of CLI [commands](./src/cli.ts).
