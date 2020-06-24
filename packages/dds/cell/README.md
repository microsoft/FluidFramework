# @fluidframework/cell

## SharedCell

The SharedCell distributed data structure can be used to store a single serializable value.

### Creation

To create a `SharedCell`, call the static create method:

```typescript
const myCell = SharedCell.create(this.runtime, id);
```

### Usage

The value stored in the cell can be set with the `.set()` method and retrieved with the `.get()` method:

```typescript
myCell.set(3);
console.log(myCell.get()); // 3
```

The value must only be plain JS objects or `SharedObject` handles (e.g. to another DDS or component).  In collaborative scenarios, the value is settled with a policy of _last write wins_.

The `.delete()` method will delete the stored value from the cell:
```typescript
myCell.delete();
console.log(myCell.get()); // undefined
```

The `.empty()` method will check if the value is undefined.
```typescript
if (myCell.empty()) {
    // myCell.get() will return undefined
} else {
    // myCell.get() will return a non-undefined value
}
```

### Eventing

`SharedCell` is an `EventEmitter`, and will emit events when other clients make modifications.  You should register for these events and respond appropriately as the data is modified.  `valueChanged` will be emitted in response to a `set`, and `delete` will be emitted in response to a `delete`.
