# @fluidframework/map

The @fluidframework/map package contains

## SharedMap

The SharedMap distributed data structure can be used to store key-value pairs. It provides the same API for setting and
retrieving values that JavaScript developers are accustomed to with the
[Map](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map) built-in object.

### Creation

To create a `SharedMap`, call the static create method:

```typescript
const myMap = SharedMap.create(this.runtime, id);
```

### Usage

Unlike JavaScript Maps, a SharedMap's keys must be strings. The value must only be plain JS objects, `SharedObject`
handles, or value types, including another distributed data structure. Thus, you can use nested SharedMaps and other
distributed data structures to construct a Fluid data model.

SharedMap keys are _last write wins_; this behavior works well with few infrequent writers and many readers. In cases
with many frequent writers it's best to design your use of the map such that each writer writes to its own keys/maps, so
they don't overwrite each other.

#### `.wait()`

`SharedMap` has a `wait` method in addition to the normal `get`, which returns a `Promise` that resolves to the value
when the key becomes available.

### Eventing

`SharedMap` is an `EventEmitter`, and will emit events when other clients make modifications.  You should register for these events and respond appropriately as the data is modified.  `valueChanged` will be emitted in response to a `set`, `delete`, or modification of a value type, and provide the key and previous value that was stored at that key.  `clear` will be emitted in response to a `clear`.

## SharedDirectory and IDirectory

A `SharedDirectory` is a map-like DDS that additionally supports storing key/value pairs within a tree of subdirectories.  This subdirectory tree can be used to give hierarchical structure to stored key/value pairs rather than storing them on a flat map.  Both the `SharedDirectory` and any subdirectories are `IDirectories`.

### Creation

To create a `SharedDirectory`, call the static create method:

```typescript
const myDirectory = SharedDirectory.create(this.runtime, id);
```

### Usage

The map operations on an `IDirectory` refer to the key/value pairs stored in that `IDirectory`, and function just like `SharedMap` including the same extra functionality and restrictions on keys and values.  To operate on the subdirectory structure, use the corresponding subdirectory methods.

#### `getWorkingDirectory()`

To "navigate" the subdirectory structure, `IDirectory` provides a `getWorkingDirectory` method which takes a relative path and returns the `IDirectory` located at that path if it exists.

#### Eventing

`valueChanged` events additionally provide the absolute path to the subdirectory storing the value that changed.
