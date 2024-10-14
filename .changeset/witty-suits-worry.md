---
"fluid-framework": minor
"@fluidframework/tree": minor
---
---
section: tree
highlight: true
---

✨ New! Alpha APIs for producing SharedTree schema from enums

`adaptEnum` and `enumFromStrings` have been added to `@fluidframework/tree/alpha` and `fluid-framework/alpha`.
These unstable alpha APIs are relatively simple helpers on-top of public APIs (source: [schemaCreationUtilities.ts](https://github.com/microsoft/FluidFramework/blob/main/packages/dds/tree/src/simple-tree/schemaCreationUtilities.ts)):
thus if these change or stable alternatives are needed, an application can replicate this functionality using these implementations as an example.
