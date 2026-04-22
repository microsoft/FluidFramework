---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---

Add `changedProperties` to `treeChanged` events for array and non-array nodes

The `treeChanged` event in `TreeChangeEventsAlpha` now carries richer payload data:

- **For array nodes**: `ArrayNodeTreeChangedRetainOp` gains an optional `changedProperties` field (a `ReadonlySet<string>` of stored field keys) when the retained element's own fields changed directly. This is defined only when the element itself emitted a `nodeChanged`-equivalent change; `undefined` when only deeper descendants changed.

- **For object, map, and record nodes**: The `treeChanged` event now delivers a `NodeChangedDataTreeProperties<TNode>` payload with a `changedProperties` field. It is defined (and non-empty) when this node's own properties changed shallowly, and `undefined` when only deeper descendants changed.

Previously, non-array `treeChanged` fired with no payload (same as the stable `TreeChangeEvents.treeChanged`). Now it provides `changedProperties` information, making it consistent with `nodeChanged`.

| API | Kind | Package Export |
|-----|------|----------------|
| `ArrayNodeTreeChangedRetainOp.changedProperties` | Property | `@alpha` |
| `NodeChangedDataTreeProperties` | Interface | `@alpha` |
| `TreeChangeEventsAlpha.treeChanged` | Property | `@alpha` |
