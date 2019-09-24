---
uid: SharedMap
---

# SharedMap

- Package: <xref:@microsoft/fluid-map!>
- API documentation: <xref:@microsoft/fluid-map!SharedMap:class>

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

[!INCLUDE [object-serialization](../includes/object-serialization.md)]

SharedMap keys are _last write wins_; this behavior works well with few infrequent writers and many readers. In cases
with many frequent writers it's best to design your use of the map such that each writer writes to its own keys/maps, so
they don't overwrite each other.

`SharedMap` has a <xref:@microsoft/fluid-map!SharedMap%23wait:member(1)> method in addition to the normal
<xref:@microsoft/fluid-map!SharedMap%23get:member(1)>, which returns a `Promise` that resolves to the value when the key becomes
available.

### Eventing

`SharedMap` is an `EventEmitter`, and will emit events when other clients make modifications. You should register for
these events and respond appropriately as the data is modified.

[valueChanged](<xref:@microsoft/fluid-map!SharedMap%23on:member(2)>) will be emitted in response to a
<xref:@microsoft/fluid-map!SharedMap%23set:member(1)>, <xref:@microsoft/fluid-map!SharedMap%23delete:member(1)> and
provide the key and previous value that was stored at that key.

`clear` will be emitted in response to <xref:@microsoft/fluid-map!SharedMap%23clear:member(1)>.

## Related distributed data structures

- <xref:SharedDirectory>
