# @fluid-experimental/attributable-map

<!-- AUTO-GENERATED-CONTENT:START (README_PACKAGE_SCOPE_NOTICE) -->

**IMPORTANT: This package is experimental.**
**Its APIs may change without notice.**

**Do not use in production scenarios.**

<!-- AUTO-GENERATED-CONTENT:END -->

## Overview

This experimental DDS is a copy of `SharedMap` which additionally tracks attribution information, such as the user who made an update and the timestamp of the change. Please refer to the description of [attributor](../../../packages/framework/attributor/README.md) for more details.

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
