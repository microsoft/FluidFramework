---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---
Fix nodeChanged events for changes to unknown optional fields

When another client changed an [unknown optional field](https://fluidframework.com/docs/api/fluid-framework/objectschemaoptions-interface#allowunknownoptionalfields-propertysignature) of an object node, subscribing to `nodeChanged` on that node caused an error to be thrown when the change was applied.
This also affected `TreeAlpha.trackObservations` and `TreeAlpha.trackObservationsOnce`, which subscribe to `nodeChanged` on observed nodes.

Now `nodeChanged` is emitted for these changes.
Since unknown optional fields have no property key, `changedProperties` reports them as a single `"unknown: one or more unknown optional fields changed"` entry.
`TreeAlpha.trackObservations` and `TreeAlpha.trackObservationsOnce` are invalidated when unknown optional fields change, if the tracked code observed them (for example, by calling `TreeAlpha.hasUnknownChildren`).
