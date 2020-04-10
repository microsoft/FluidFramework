---
---

# Explicit operation ordering

While it is not strictly necessary to understand Fluid's underlying technology -- like the fact that it is
operations-based -- understanding

Fluid is strictly based on operations. This means that the runtime makes guarantees about behavior _at the operation
level._ This can present challenges when using the distributed data structures, when your needs as a developer don't
match completely with the operations that the DDS provides.

Consider the SharedNumberSequence DDS. It stores a list/array of numbers, and, like all SharedSequences, provides
methods for inserting new numbers at a particular index, removing numbers, and retrieving numbers. Each of these methods
(`insert`, `remove`, and `getRange`) corresponds to an operation on the SharedNumberSequence. Fluid guarantees that
these operations will be totally ordered along with all other ops, and that all clients will eventually reach the same
state. However, operations may be interleaved with other operations from other clients, and sometimes, this isn't
desirable.

For example, consider implementing a `set` method for a SharedNumberSequence. For simplicity, we'll pass all the
necessary arguments to the method in this example, but in a practical application the method signature may look
different.

**We're also going to omit input validation; this is critical in a true implementation.**

```ts
import { IHostRuntime } from "@microsoft/fluid-runtime-definitions";
import { SharedNumberSequence } from "@microsoft/fluid-sequence";

function set(
  sequence: SharedNumberSequence,
  hostRuntime: IHostRuntime,
  index: number,
  value: number
): void {
  // Do some input validation
  if (index < 0) {
    throw new Error(`index < 0`);
  }

  // More input validation
  const len = sequence.getLength();
  if (index >= len) {
    throw new Error(`index out of range (${index} >= ${len})`);
  }

  // Insert the value at the index, which will shift the current item at that index
  // "farther" away per the sequence merge behavior...
  sequence.insert(index, [value]);

  // Now we remove the item that was shifted away
  sequence.remove(index + 1, index + 2);
}
```

At first, this code appears correct. It inserts a number then removes the number that it is meant to replace, right?

Indeed, if `sequence` was a typical JavaScript Array, this code would be correct. But in a distributed system like
Fluid, the sequence can be modified by other clients! At runtime, `sequence` could be modified by another client between
when the number was inserted on line 23 and when the replaced number is removed on line 26, which may result in the
wrong item being removed.

In the next section, we'll break down how the code above can behave incorrectly in a distributed system step by step. If
you want to instead immediately learn about how to solve this problem in Fluid, you can [skip
ahead.](#fixing-the-problem-ordersequentially)

## Breaking down the "bug"

To illustrate how the code above is "buggy," let's walk through an example with two clients. Initially, the sequence
contains the numbers 0-3 in the corresponding indices.

```ts
//   content: 0123
// positions: 0123
```

Client A wants to replace the number at index 2 with a 9, so it calls the function above:

```ts
// Client A
set(theSequence, hostRuntime, 2, 9);
```

At the same time, Client B removes the number at index 1

```ts
// Client B
theSequence.remove(1, 2);
```

Operations-wise, the Fluid server is sent three ops -- an `insert` and `remove` from Client A and an `insert` from
Client B. However, there is no guarantee in what order those operations will be sequenced. Our only guarantee, given our
knowledge of the code, is that Client A's `remove` operation will be ordered after its `insert` operation, because of
the order of execution in the code. So, given that constraint the possible ordering of the ops _could_ be one of the
following three orders:

```ts
// Start
//   content: 0123
// positions: 01234

// insert (Client A)
//   content: 01923
// positions: 01234

// remove (Client A)
//   content: 0193
// positions: 01234

// remove (Client B)
//   content: 093
// positions: 01234

// Final result
//   content: 093
// positions: 01234
```

```ts
// Start
//   content: 0123
// positions: 01234

// remove (Client B)
//   content: 023
// positions: 01234

// insert (Client A)
//   content: 0923
// positions: 01234

// remove (Client A)
//   content: 093
// positions: 01234

// Final result
//   content: 093
// positions: 01234
```

In the first two combinations, we end up with the same result: `093`. But in the third combination, the operation from
Client B is _interleaved_ between the two operations from Client A. This results in a different end state, and one that
is not intended: `092`.

```ts
// Start
//   content: 0123
// positions: 01234

// insert (Client A)
//   content: 01923
// positions: 01234

// remove (Client B)
//   content: 0923
// positions: 01234

// remove (Client A)
//   content: 092
// positions: 01234

// Final result
//   content: 092
// positions: 01234
```

From Fluid's perspective, this is perfectly fine. Each client will reach the same consistent state eventually. However,
that end state isn't what we expected or desired. We have a guarantee that Client A's `remove` will be ordered after its
`insert`, but we need to further guarantee that those two operations will be ordered sequentially. In other words, we
need to make sure that third combination can't happen.

## Fixing the problem: `orderSequentially`

Fortunately, Fluid provides a way to ensure that operations are ordered sequentially, which we can use to guarantee that
the `set` method's two operations never have any other operations interleaved between them. This, in turn

## Important considerations


## Grave yard

A different way to think about this problem is to ask, "How can we make the `set` method _thread-safe_?" Thread-safety
is a similar concept if you consider each Fluid client a separate thread.

