---
"fluid-framework": minor
"@fluidframework/tree": minor
"__section": tree
---
"Unsafe" @system types moved to System_Unsafe namespace

Working code conforming to the [rules regarding API Support Levels](https://fluidframework.com/docs/build/releases-and-apitags#api-support-levels) should be unaffected, but this resolves an issue which required violating these rules and directly referencing `@system` types.

Sometimes packages exporting SharedTree schema related types for recursive schema could yield errors like:

> error TS2742: The inferred type of 'YourSchema' cannot be named without a reference to '../node_modules/@fluidframework/tree/lib/internalTypes.js'.
> This is likely not portable.
> A type annotation is necessary.

Mitigating this error could require explicitly referencing these `@system` types from `internalTypes`.
Any such references to the moved types should be able to be deleted, as TypeScript will now be able to find them in the new namespace without assistance.

This does not migrate all types out of `internalTypes`, so some occurrences of this issue may remain.
