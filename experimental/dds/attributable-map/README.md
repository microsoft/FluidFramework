# @fluid-experimental/attributable-map

## Overview

This experimental DDS is a fork of the SharedMap which implements attribution, the plan is to remove it and integrate those APIs into SharedMap.

## AttributableMap

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

#### `.wait()`

`SharedMap` has a `wait` method in addition to the normal `get`, which returns a `Promise` that resolves to the value
when the key becomes available.

### Eventing

`SharedMap` is an `EventEmitter`, and will emit events when other clients make modifications. You should register for these events and respond appropriately as the data is modified. `valueChanged` will be emitted in response to a `set` or `delete`, and provide the key and previous value that was stored at that key. `clear` will be emitted in response to a `clear`.

### Attribution

This experimental DDS allows for the tracking of attribution information, such as the user who made an update and the timestamp of the change. The `attributableMap` currently includes three types of attribution keys: Op-stream, detached, and local.

-   The Op-stream attribution key indicates that the update of attribution information is synchronized with the processing of a map operation, and only occurs once the update is ack'd.
-   The detached attribution key only occurs when the DDS is not attached, and can be summarized into a snapshot.
-   The local attribution key exists when the operation has not yet been ack'd and cannot be summarized.
