# @SharedArray

## SharedArray

The SharedArray distributed data structure can be used to store ordered sequence of values. It provides APIs to insert, delete and move a specific entry.

### Creation

To create a `SharedArray`, call the static create method:

```typescript
const myArray = SharedArray.create(this.runtime, id);
```

### Usage

Values in `SharedArray` must only be plain JS objects or handles (e.g. to another DDS or component).

In collaborative scenarios, the value is settled with a policy of _last write wins_ except for if a delete preceeds any other operation (in this case the element is considered deleted and hence no other operations for this entry is applied)

The DDS also supports undo/redo of any of the aforesaid operations.

#### `.move(fromIndex, toIndex)`

`SharedArray` has a `move` method in addition to the normal `insert` and `delete`, which moves the value of the curent index to the destination index.

### Eventing

`SharedArray` is an `EventEmitter`, and will emit events when other clients make modifications.  You should register for these events and respond appropriately as the data is modified.  `valueChanged` will be emitted in response to a `insert` or `delete` or `move`.
