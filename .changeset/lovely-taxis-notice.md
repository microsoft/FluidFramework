---
"fluid-framework": minor
"@fluidframework/tree": minor
---
---
"section": tree
---

SharedTree event listeners that implement `Listenable` now allow deregistration of event listeners via an `off()` function.

The ability to deregister events via a callback returned by `on()` remains the same.
Both strategies will remain supported and consumers of SharedTree events may choose which method of deregistration they prefer in a given instance.

```typescript
// The new behavior
function deregisterViaOff(view: TreeView<MySchema>): {
	const listener = () => { /* ... */ };
	view.events.on("commitApplied", listener); // Register
	view.events.off("commitApplied", listener); // Deregister
}

// The existing behavior (still supported)
function deregisterViaCallback(view: TreeView<MySchema>): {
	const off = view.events.on("commitApplied", () => { /* ... */ }); // Register
	off(); // Deregister
}
```
