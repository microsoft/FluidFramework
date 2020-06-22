# @fluidframework/base-host

`BaseHost` provides an easy-to-use entry point for hosts of Fluid experiences.  Given a configuration, it helps load and initialize a container and provides helpers to retrieve components from that container.

## BaseHost

### Creation

To create a `BaseHost`, you'll need to profide a configuration `IBaseHostConfig`.

```typescript
const baseHostConfig = {
    codeResolver, // an IFluidCodeResolver
    documentServiceFactory, // an IDocumentServiceFactory
    urlResolver, // an IUrlResolver
};
const baseHost = new BaseHost(baseHostConfig);
```

#### IBaseHostConfig

The key members of `IBaseHostConfig` are an `IFluidCodeResolver` (used for loading code into the container), an `IDocumentServiceFactory` (used for connecting to the Fluid service), and an `IUrlResolver` (used for resolving URLs used in API calls against the `Loader` and `Container`).

### Usage

`BaseHost` provides a method `.initializeContainer()` which will retrieve a `Container` from the given url, and if necessary initializing it with the given code in the process.

```typescript
const container = await baseHost.initializeContainer(url, codeDetails);
```

Once the container is retrieved and initialized this way, requests can be made against it.

`BaseHost` also provides a method `.getComponent()` for retrieving components directly (bypassing the `Container`) for convenience.

```typescript
const component = await baseHost.getComponent(url);
```

The `Loader` can be also be retrieved via `.getLoader()`.

```typescript
const loader = await baseHost.getLoader();
```

## initializeContainerCode()

If the full facilities of a `BaseHost` aren't needed, the helper `initializeContainerCode()` can be used directly to initialize a container with code.

```typescript
await initializeContainerCode(container, codeDetails);
```

After this promise resolves, the container will be initialized, though the context change may not have occurred yet.
