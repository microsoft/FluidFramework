---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
The treeChanged event reserves its listener argument for event data

[`TreeChangeEvents.treeChanged`](https://fluidframework.com/docs/api/tree/treechangeevents-interface#treechanged-method) now declares its first listener argument as optional `unknown`.
The event's runtime behavior has not changed, but the declaration reserves that position for event data that experimental or future APIs may provide.

Most listeners require no changes.
Listeners that declare their own optional first parameter should remove it or use a wrapper so they do not interpret event data as application data.
For example, use a zero-argument inline callback when subscribing to the stable event:

```typescript
Tree.on(node, "treeChanged", () => {
	// Read the updated tree here.
});
```
