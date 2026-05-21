---
"@fluidframework/core-interfaces": minor
"@fluidframework/core-utils": minor
"__section": legacy
---
Add `AllOrNone` type modifier and `validateAllOrNone` runtime helper

A new shared "all-or-none" primitive is now available for entry points that take a group of cooperating inputs and must accept either all of them together or none of them at all.

#### `AllOrNone<T>` (`@fluidframework/core-interfaces`)

`@legacy @alpha` type modifier that constrains the keys of `T` to be either all present (with their declared types) or all absent. Mixed shapes are rejected at compile time.

```ts
import type { AllOrNone } from "@fluidframework/core-interfaces/legacy/alpha";

interface Auth { user: string; token: string }
type Props = { url: string } & AllOrNone<Auth>;

const a: Props = { url: "x" };                        // ok
const b: Props = { url: "x", user: "u", token: "t" }; // ok
const c: Props = { url: "x", user: "u" };             // compile error
```

#### `validateAllOrNone<T>(obj, keys)` (`@fluidframework/core-utils`)

`@internal` runtime classifier that returns `"all"`, `"none"`, or `"mixed"` based on which of the named keys carry a defined value. Useful at API entry points to translate the `"mixed"` misuse case (when a partial group reaches the layer through a cast or an erased discriminated union) into a single named `UsageError` instead of a less helpful failure deeper in the stack.

```ts
import { validateAllOrNone } from "@fluidframework/core-utils/internal";

const shape = validateAllOrNone(input, ["request", "urlResolver", "documentServiceFactory"]);
if (shape === "mixed") {
    throw new UsageError(
        "request, urlResolver, and documentServiceFactory must all be provided or all omitted",
    );
}
```

Both symbols are used by the new offline form of `loadFrozenContainerFromPendingState` in `@fluidframework/container-loader`, which is also released in this version.
