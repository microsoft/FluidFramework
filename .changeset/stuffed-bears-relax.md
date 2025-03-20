---
"@fluid-experimental/tree-react-api": minor
---
---
"section": other
---

Update data object APIs to leverage new SharedTree-based data object class

Rather than leveraging a classic `DataObject` with a `SharedDirectory` at the root, and a `SharedTree` beneath, the library now leverages a new data object class that uses the `SharedTree` directly at the root.
Results in some simplifications to this package's APIs which are breaking.
Namely,
- Removes the `key` property from the data object configuration.
  This key was used to inform where the SharedTree was parented beneath the root SharedDirectory, so it no longer serves a purpose.
- Inlined the `ITreeDataObject` interface into `IReactTreeDataObject`.
