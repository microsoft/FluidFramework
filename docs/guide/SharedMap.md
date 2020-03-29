---
uid: SharedMap
---

# SharedMap

- Package: [@microsoft/fluid-map](../api/fluid-map.md)
- API documentation:
  - [SharedMap](../api/fluid-map.sharedmap.md)
  - [ISharedMap](../api/fluid-map.isharedmap.md)

The SharedMap distributed data structure can be used to store key-value pairs. It provides the same API for setting and
retrieving values that JavaScript developers are accustomed to with the
[Map](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map) built-in object.

## Creation

To create a `SharedMap`, call the static create method:

```typescript
const myMap = SharedMap.create(this.runtime, id);
```

## Usage

Unlike JavaScript Maps, a SharedMap's keys must be strings. The value must only be plain JS objects, `SharedObject`
handles, or value types., including another distributed data structure. Thus, you can use nested SharedMaps and other
distributed data structures to construct a Fluid data model.

!!!include(object-serialization.md)!!!

SharedMap keys are _last write wins_; this behavior works well with few infrequent writers and many readers. In cases
with many frequent writers it's best to design your use of the map such that each writer writes to its own keys/maps, so
they don't overwrite each other.

`SharedMap` has a [wait](../api/fluid-map.sharedmap.wait.md) method in addition to the normal
[get](../api/fluid-map.sharedmap.get.md), which returns a `Promise` that resolves to the value when the key becomes
available.

### Eventing

`SharedMap` is an `EventEmitter`, and will emit events when other clients make modifications. You should register for
these events and respond appropriately as the data is modified.

[valueChanged](../api/fluid-map.sharedmap.on_1.md) will be emitted in response to a
[set](../api/fluid-map.sharedmap.set.md) or [delete](../api/fluid-map.sharedmap.delete.md) and
provide the key and previous value that was stored at that key.

`clear` will be emitted in response to [clear](../api/fluid-map.sharedmap.clear.md).

## Examples using SharedMap

[Sudoku](../examples/sudoku.md)

## Related distributed data structures

- [SharedDirectory][]

[SharedDirectory]: ./SharedDirectory.md
