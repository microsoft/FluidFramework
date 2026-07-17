---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": tree
---
Add at, pop, shift, unshift, findLast, and findLastIndex methods to TreeArrayNodeAlpha

`TreeArrayNodeAlpha` now has `at`, `pop`, `shift`, `unshift`, `findLast`, and `findLastIndex` methods, further aligning it with JavaScript's built-in Array API:

- `at(index)`  `at` was already implemented at runtime, and consumers compiling with `lib: ES2022` or later could already see it through the inherited `ReadonlyArray` typings. This change adds no new runtime behavior, but makes `at` an explicitly declared, documented part of the API, independent of the consumer's TypeScript `lib` configuration.
- `unshift(...items)` is an alias for `insertAtStart`, mirroring how `push` aliases `insertAtEnd`: it inserts new item(s) at the start of the array. Unlike `Array.prototype.unshift`, it does not return the new length of the array.
- `pop()` removes and returns the last item in the array, or returns `undefined` (without modifying the array) if it is empty.
- `shift()` removes and returns the first item in the array, or returns `undefined` (without modifying the array) if it is empty.
- `findLast(predicate, thisArg?)` and `findLastIndex(predicate, thisArg?)` search the array from the last item to the first, returning the last matching item (or `undefined`) and its index (or `-1`) respectively, like their `Array.prototype` equivalents. As with `Array.prototype.findLast`, passing a type guard as the `findLast` predicate narrows the returned item's type.

These methods are available on `TreeArrayNodeAlpha`, which can be obtained from an existing `TreeArrayNode` via `asAlpha`, or by declaring the schema with `SchemaFactoryAlpha`'s `arrayAlpha`.

#### Usage

```typescript
import { SchemaFactory, asAlpha } from "@fluidframework/tree/alpha";

const sf = new SchemaFactory("example");
const Inventory = sf.array("Inventory", sf.string);
const inventory = asAlpha(new Inventory(["Apples", "Bananas", "Pears"]));

// inventory: ["Apples", "Bananas", "Pears"]
inventory.unshift("Oranges", "Grapes");
// inventory: ["Oranges", "Grapes", "Apples", "Bananas", "Pears"]

inventory.at(0); // "Oranges"
inventory.at(-1); // "Pears"
inventory.at(10); // undefined

inventory.findLast((item) => item.startsWith("G")); // "Grapes"
inventory.findLastIndex((item) => item.startsWith("G")); // 1

// inventory: ["Oranges", "Grapes", "Apples", "Bananas", "Pears"]
inventory.pop(); // "Pears"
// inventory ["Oranges", "Grapes", "Apples", "Bananas"]

inventory.shift(); // "Oranges"
// inventory: ["Grapes", "Apples", "Bananas"]
```
