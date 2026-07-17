---
"@fluidframework/container-loader": minor
"__section": legacy
---
Add support for containers backed by an empty, no-op runtime

A new `@alpha` `createEmptyRuntimeCodeLoader` function is now exported from `@fluidframework/container-loader`.
It returns an `ICodeDetailsLoader` whose loaded module produces a minimal, no-op container runtime.

This is useful when you need the capabilities of an `IContainer` — such as loading, connecting to, or reading the pending state of an existing container — without wiring up a real container runtime.
The empty runtime ignores all incoming ops and signals, and it never sends any ops or signals of its own.
Because it has no content, it can only be used to load existing containers: creating a new (detached) container with it throws.

```typescript
// ...
const loader = new Loader({
	codeLoader: createEmptyRuntimeCodeLoader(),
	documentServiceFactory,
	urlResolver,
});
const container = await loader.resolve({ url });
// ...
```
