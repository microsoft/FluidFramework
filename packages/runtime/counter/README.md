# @fluidframework/counter

A `SharedCounter` is a shared object which holds a number that can be incremented or decremented.

## Creation

To create a `SharedCounter`, get the factory and call create with a runtime and string ID:

```typescript
const factory = SharedCounter.getFactory();
const counter = factory.create(this.runtime, id) as SharedCounter;
```

## Usage

Once created, you can call `increment` to modify the value with either a positive or negative number:

```typescript
counter.increment(10); // add 10 to the counter value
counter.increment(-5); // subtract 5 from the counter value
```

To observe changes to the value (including those from remote clients), register for the `"incremented"` event:

```typescript
counter.on("incremented", (incrementAmount, newValue) => {
    console.log(`The counter incremented by ${incrementAmount} and now has a value of ${newValue}`);
});
```
