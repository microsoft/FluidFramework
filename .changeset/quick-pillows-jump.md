---
"@fluidframework/tree": minor
"fluid-framework": minor
"__section": tree
---

New allowUnused utility function

The new `allowUnused` utility function discards its type or runtime argument.
When TypeScript is configured to reject code with unused locals, this function can be used to suppress that error enabling use of [ValidateRecursiveSchema](https://fluidframework.com/docs/api/fluid-framework/validaterecursiveschema-typealias) to compile.

```typescript
class Test extends sf.arrayRecursive("Test", () => Test) {} // Bad
allowUnused<ValidateRecursiveSchema<typeof Test>>(); // Reports compile error due to invalid schema above.
```
