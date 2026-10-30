---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Fix nodeChanged events for changes to unknown optional fields

When another client changed an [unknown optional field](https://fluidframework.com/docs/api/fluid-framework/objectschemaoptions-interface#allowunknownoptionalfields-propertysignature) of an object node, subscribing to `nodeChanged` on that node caused an error to be thrown when the change was applied.
This also affected `TreeAlpha.trackObservations`, `TreeAlpha.trackObservationsOnce`, and React components using observation tracking from `@fluidframework/react`, such as `useTreeObservations` and `withTreeObservations`.

Now `nodeChanged` is emitted for these changes.
Unknown optional fields have no property, so they are not included in `changedProperties`.
Instead, the new `changedUnknownProperties` property of the event data lists their stored keys.
If only unknown optional fields changed, `changedProperties` is empty.

```typescript
TreeBeta.on(node, "nodeChanged", ({ changedProperties, changedUnknownProperties }) => {
	// changedProperties: property keys of known fields that changed.
	// changedUnknownProperties: stored keys of unknown optional fields that changed, or undefined if none changed.
});
```

Observation tracking is invalidated when an unknown optional field changes if the tracked code observed it, for example by calling `TreeAlpha.hasUnknownChildren`.
