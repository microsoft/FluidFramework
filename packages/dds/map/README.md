# @fluidframework/map

<!-- AUTO-GENERATED-CONTENT:START (README_DEPENDENCY_GUIDELINES_SECTION:includeHeading=TRUE) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Using Fluid Framework libraries

When taking a dependency on a Fluid Framework library, we recommend using a `^` (caret) version range, such as `^1.3.4`.
While Fluid Framework libraries may use different ranges with interdependencies between other Fluid Framework libraries,
library consumers should always prefer `^`.

Note that when depending on a library version of the form `2.0.0-internal.x.y.z`, called the Fluid internal version scheme,
you must use a `>= <` dependency range (such as `>=2.0.0-internal.x.y.z <2.0.0-internal.w.0.0` where `w` is `x+1`).
Standard `^` and `~` ranges will not work as expected.
See the [@fluid-tools/version-tools](https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/version-tools/README.md)
package for more information including tools to convert between version schemes.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->

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

Unlike the JavaScript `Map`, a `SharedMap`'s keys must be strings. The value must only be plain JS objects or handles (e.g. to another DDS or Fluid objects).

In collaborative scenarios, the value is settled with a policy of _last write wins_.

### Eventing

`SharedMap` is an `EventEmitter`, and will emit events when other clients make modifications. You should register for these events and respond appropriately as the data is modified. `valueChanged` will be emitted in response to a `set` or `delete`, and provide the key and previous value that was stored at that key. `clear` will be emitted in response to a `clear`.

## SharedDirectory and IDirectory

A `SharedDirectory` is a map-like DDS that additionally supports storing key/value pairs within a tree of subdirectories. This subdirectory tree can be used to give hierarchical structure to stored key/value pairs rather than storing them on a flat map. Both the `SharedDirectory` and any subdirectories are `IDirectories`.

### Creation

To create a `SharedDirectory`, call the static create method:

```typescript
const myDirectory = SharedDirectory.create(this.runtime, id);
```

### Usage

The map operations on an `IDirectory` refer to the key/value pairs stored in that `IDirectory`, and function just like `SharedMap` including the same extra functionality and restrictions on keys and values. To operate on the subdirectory structure, use the corresponding subdirectory methods.

#### `getWorkingDirectory()`

To "navigate" the subdirectory structure, `IDirectory` provides a `getWorkingDirectory` method which takes a relative path and returns the `IDirectory` located at that path if it exists.

#### Eventing

`valueChanged` events additionally provide the absolute path to the subdirectory storing the value that changed.

`dispose` events are fired on sub directory which is deleted. Any access to this sub directory will throw an error once it is disposed.
