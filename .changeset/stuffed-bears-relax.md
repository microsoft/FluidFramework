---
"@fluid-experimental/tree-react-api": minor
---
---
"section": other
---

Simplify experimental tree data object implementation

The experimental tree data object in `tree-react-api` has been simplified in a way that is incompatible with its previous version, which used `SharedDirectory` at the root.
The library now leverages a new data object that uses the `SharedTree` directly at the root.
In addition to breaking compatibility with existing documents, these changes include some related simplifications to the APIs which are also breaking:

- Removes the `key` property from the data object configuration.
  This key was used to inform where the SharedTree was parented beneath the root SharedDirectory, so it no longer serves a purpose.
- Inlined the `ITreeDataObject` interface into `IReactTreeDataObject`.
