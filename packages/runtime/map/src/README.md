# SharedMap
A `SharedMap` is a DDS that functions similarly to a normal `Map` in JS.

## Creation
To create a `SharedMap`, call the static create method:
```typescript
const myMap = SharedMap.create(this.runtime, id);
```

## Usage
You can use a `SharedMap` mostly the same way you would a normal `Map` in JS.  However, keys must be strings only, and values must only be plain JS objects, `SharedObject` handles, or value types.  `SharedMap` also supports the following additional functionality as compared to a `Map`:

### `.createValueType()`
`SharedMap` has a `createValueType` method which creates a value type.  More on that below.

### `.wait()`
`SharedMap` has a `wait` method in addition to the normal `get`, which returns a `Promise` that resolves to the value when the key becomes available.

### Eventing
`SharedMap` is an `EventEmitter`, and will emit events when other clients make modifications.  You should register for these events and respond appropriately as the data is modified.  `valueChanged` will be emitted in response to a `set`, `delete`, or modification of a value type, and provide the key and previous value that was stored at that key.  `clear` will be emitted in response to a `clear`.

# SharedDirectory and IDirectory
A `SharedDirectory` is a map-like DDS that additionally supports storing key/value pairs within a tree of subdirectories.  This subdirectory tree can be used to give hierarchical structure to stored key/value pairs rather than storing them on a flat map.  Both the `SharedDirectory` and any subdirectories are `IDirectories`.

## Creation
To create a `SharedDirectory`, call the static create method:
```typescript
const myDirectory = SharedDirectory.create(this.runtime, id);
```

## Usage
The map operations on an `IDirectory` refer to the key/value pairs stored in that `IDirectory`, and function just like `SharedMap` including the same extra functionality and restrictions on keys and values.  To operate on the subdirectory structure, use the corresponding subdirectory methods.

### `getWorkingDirectory()`
To "navigate" the subdirectory structure, `IDirectory` provides a `getWorkingDirectory` method which takes a relative path and returns the `IDirectory` located at that path if it exists.

### Eventing
`valueChanged` events additionally provide the absolute path to the subdirectory storing the value that changed.

# Value types
Value types are values stored on `SharedMap` and `SharedDirectory` that have special behaviors beyond what a plain JS object supports.

## Counter
You can create a counter on a key and increment it.

### Creation
To create a `Counter`, call .createValueType on the map/directory with the type and initial value.
```typescript
myMap.createValueType("counterKey", CounterValueType.Name, 0);
const myCounter = myMap.get("counterKey");
```

### Usage
The `increment` method allows the counter to be incremented (or decremented, if a negative value is passed).  It will emit an `incremented` event with the amount incremented and current value, in addition to a `valueChanged` on the `SharedMap` or `SharedDirectory` it is contained within.  The current value can be read from the `value` property.
```typescript
myCounter.on("incremented", () => { console.log(myCounter.value); });
myCounter.increment(5); // will increment the counter by 5 and console log the current value
```