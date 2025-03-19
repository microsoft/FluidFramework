---
"fluid-framework": minor
"@fluidframework/tree": minor
---
---
"section": tree
---

Add `allowUnused` utility.

Add an `allowUnused` utility function which discards its type or runtime argument.
This can be used to enable use of [ValidateRecursiveSchema](https://fluidframework.com/docs/api/fluid-framework/validaterecursiveschema-typealias) in environments where TypeScript is configured to reject code with unused locals.

```typescript
class Test extends sf.arrayRecursive("Test", () => Test) {} // Bad
allowUnused<ValidateRecursiveSchema<typeof Test>>(); // Reports compile error due to invalid schema above.
```
