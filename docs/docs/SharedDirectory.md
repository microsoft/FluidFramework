---
uid: SharedDirectory
---

# SharedDirectory and IDirectory

- Package: [@fluidframework/map](../api/fluid-map.md)
- API documentation:
  - [SharedDirectory](../api/fluid-map.shareddirectory.md)
  - [IDirectory](../api/fluid-map.idirectory.md)

The SharedDirectory distributed data structure is similar to a [SharedMap][] and can be used to store key-value pairs.
In addition to the typical Map functionality for getting, setting, and iterating over values, SharedDirectory provides a
hierarchical organization of map-like data structures as SubDirectories. The values stored within can be accessed like a
map, and the hierarchy can be navigated using path syntax. SubDirectories can be retrieved for use as working
directories. This subdirectory tree can be used to give hierarchical structure to stored key/value pairs rather than
storing them on a flat map. Both the `SharedDirectory` and any subdirectories are `IDirectories`. For example:

```ts
mySharedDirectory
  .createSubDirectory("a")
  .createSubDirectory("b")
  .createSubDirectory("c")
  .set("foo", val1);
const mySubDir = mySharedDirectory.getWorkingDirectory("/a/b/c");
mySubDir.get("foo"); // returns val1
```

It provides the same API for setting and
retrieving values that JavaScript developers are accustomed to with the
[Map](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map) built-in object.

## Creation

To create a `SharedDirectory`, call the static create method:

```typescript
const myDirectory = SharedDirectory.create(this.runtime, id);
```

## Usage

The map operations on an `IDirectory` refer to the key/value pairs stored in that `IDirectory`, and function just like
[SharedMap][] including the same restrictions on keys and values. To operate on the subdirectory structure, use the
corresponding subdirectory methods.

### getWorkingDirectory

To "navigate" the subdirectory structure, `IDirectory` provides a
[getWorkingDirectory](../api/fluid-map.shareddirectory.getworkingdirectory.md) method which takes a relative path and
returns the `IDirectory` located at that path if it exists.

!!!include(object-serialization.md)!!!

SharedDirectory keys are _last write wins_; this behavior works well with few infrequent writers and many readers. In cases
with many frequent writers it's best to design your use of the directory such that each writer writes to its own keys so
they don't overwrite each other.

## Eventing

[valueChanged](../api/fluid-map.shareddirectory.on_1.md) events additionally provide the absolute path to the
subdirectory storing the value that changed.

## Related distributed data structures

- [SharedMap][]

<!-- Links -->
[SharedMap]: ./SharedMap.md
