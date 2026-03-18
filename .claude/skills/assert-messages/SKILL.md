---
name: assert-messages
description: Guidelines for writing assert and fail messages from @fluidframework/core-utils. Use when writing new asserts, reviewing assert usage, or when the user asks about assert best practices. Ensures new asserts use descriptive string literals instead of hex codes.
---

# Assert Message Guidelines

When writing **new** `assert()` or `fail()` calls using the functions from `@fluidframework/core-utils/internal`, always use a **descriptive string literal** for the message — never a manually assigned hex code.

## Import

```typescript
import { assert } from "@fluidframework/core-utils/internal";
// or
import { assert, fail } from "@fluidframework/core-utils/internal";
```

## Correct — string literal (for all new asserts)

```typescript
assert(value !== undefined, "Value must be defined when processing delta");
assert(items.length > 0, "Expected at least one item in the collection");
const node = map.get(id) ?? fail("Node not found in map");
```

## Incorrect — manually assigned hex code (do NOT do this)

```typescript
// WRONG: Do not assign hex codes manually
assert(value !== undefined, 0x123);
assert(items.length > 0, 0x456 /* "some message" */);
```

## Writing good assert messages

- **Be specific about what went wrong.** Describe the violated invariant, not just the symptom. Prefer `"Chunk must have at least one op"` over `"Bad chunk"`.
- **Include relevant context** when it helps diagnosis, e.g. `"Cannot rebase over a commit that is not in the trunk branch"`.
- **Keep messages concise** — they are error messages, not documentation. One short sentence is usually enough.
- **Use present tense** describing the expectation or violation: `"Expected node to be attached"` or `"Node must be attached before sequencing"`.

## How hex codes work (for context)

Existing hex codes (e.g. `0x1a3`) in the codebase are **auto-generated** by the `policy-check` tool before releases. It converts string literal messages into numbered error codes. You should never manually pick or assign a hex code — just write a string and let the tooling handle conversion.

## `debugMessageBuilder` parameter

Both `assert` and `fail` accept an optional third parameter `debugMessageBuilder: () => string`. Use this for expensive-to-compute diagnostic info that should only run in development builds:

```typescript
assert(
    node !== undefined,
    "Node not found in tree",
    () => `Searched for node id ${id} in tree with ${tree.size} nodes`,
);
```

## Do not modify existing asserts

These guidelines apply to **newly written** asserts only. Do not change existing hex-code asserts to strings — the hex codes are stable identifiers used for error tracking.
