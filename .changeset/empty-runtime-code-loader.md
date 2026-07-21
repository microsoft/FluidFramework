---
"@fluidframework/container-loader": minor
"__section": legacy
---
Add support for containers backed by an empty, no-op runtime

Two new `@alpha` functions are now exported from `@fluidframework/container-loader`: `createEmptyRuntimeCodeLoader`, which returns an `ICodeDetailsLoader` whose loaded module produces a minimal, no-op container runtime, and `createEmptyRuntimeFactory`, which returns just the underlying `IRuntimeFactory` for composing into an existing code loader.

This is useful when you need the capabilities of an `IContainer` — such as loading, connecting to, or reading the pending state of an existing container — without wiring up a real container runtime.
The empty runtime ignores all incoming ops and signals, and it never sends any ops or signals of its own.
Because it has no content, it can only be used to load existing containers: creating a new (detached) container with it throws.

Note that the "never sends ops or signals" guarantee comes from the runtime never invoking the `submit*` callbacks on its container context — the container still connects as a normal (potentially writable) client at the network layer.
This complements the frozen container-loader utilities (such as `createFrozenDocumentServiceFactory`), which instead enforce read-only behavior at the network/driver layer.
Callers who need network-layer read-only enforcement should pair the empty runtime with those utilities.

```typescript
// ...
const container = await loadExistingContainer({
	codeLoader: createEmptyRuntimeCodeLoader(),
	documentServiceFactory,
	urlResolver,
	request: { url },
});
// ...
```
