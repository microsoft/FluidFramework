# `SimpleLoader`

This package provides a `SimpleLoader` class, which wraps a `Loader` with a simpler interface.  This simpler interface is used by the `Migrator` during migration.

```ts
// Creating the SimpleLoader using Tinylicious
const loader = new SimpleLoader({
	urlResolver: new InsecureTinyliciousUrlResolver(),
	documentServiceFactory: new RouterliciousDocumentServiceFactory(
		new InsecureTinyliciousTokenProvider(),
	),
	codeLoader: new DemoCodeLoader(),
	generateCreateNewRequest: createTinyliciousCreateNewRequest,
});

// Creating and attaching a new container
const { container, attach } = await loader.createDetached("one");
id = await attach();

// Loading an existing container
const container = await loader.loadExisting(id);
```

TODO: Can the `Migrator` take a normal `Loader` and wrap it itself to avoid teaching a new concept here?
