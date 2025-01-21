---
"@fluidframework/shared-object-base": minor
---
---
"section": legacy
---

Replace 'any' in return type for several APIs

To improve type safety of the Fluid Framework legacy+alpha API surface,
we're moving away from using the `any` type in favor of `unknown`.

We expect that any changes required in consumers of these APIs will be limited to having to provide explicit types
when calling any of the APIs whose return value changed to `unknown`, like `IFluidSerializer.parse()`.

In summary, code that looked like this:

```typescript
// 'myVariable' ended up typed as 'any' here and TypeScript would not do any type-safety checks on it.
const myVariable = this.serializer.parse(stringHeader);
```

Will now have to look like this:

```typescript
// Do this if you know the type of the object you expect to get back.
const myVariable = this.serializer.parse(stringHeader) as MyType;

// Alternatively, this will maintain current behavior but also means no type-safety checks will be done by TS.
// const myVariable = this.serializer.parse(stringHeader) as any;
```

The appropriate type will depend on what the calling code is doing and the objects it expects to be dealing with.

We further encourage consumers of any of these APIs to add runtime checks
to validate that the returned object actually matches the expected type.

The list of affected APIs is as follows:

- `IFluidSerializer.encode(...)` now takes `value: unknown` instead of `value: any` and returns `unknown` instead of `any`.
- `IFluidSerializer.decode(...)` now takes `input: unknown` instead of `input: any` and returns `unknown` instead of `any`.
- `IFluidSerializer.stringify(...)` now takes `value: unknown` instead of `value: any`.
- `IFluidSerializer.parse(...)` now returns `unknown` instead of `any`.
- `SharedObjectCore.applyStashedOps(...)` now takes `content: unknown` instead of `content: any`.
- `SharedObjectCore.rollback(...)` now takes `content: unknown` instead of `content: any`.
- `SharedObjectCore.submitLocalMessage(...)` now takes `content: unknown` instead of `content: any`.
- `SharedObjectCore.reSubmitCore(...)` now takes `content: unknown` instead of `content: any`.
- In `SharedObjectCore.newAckBasedPromise<T>(...)` the `executor` parameter now takes `reject: (reason?: unknown)`
  instead of `reject: (reason?: any)`.
- `makeHandlesSerializable(...)` now returns `unknown` instead of `any`.
- `parseHandles(...)` now returns `unknown` instead of `any`.

Additionally, the following APIs were never designed to return a value and have thus been updated to return `void` instead of `any`:

- `SharedObjectCore.processCore(...)`.
- `SharedObjectCore.onDisconnect(...)`
