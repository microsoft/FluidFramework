# Export testing

TypeScript generates d.ts files when compiling code with exports for use by another compilation unit (such as a package or project).

Importing types from these d.ts files type checks differently than importing the original source files directly.
There are a few different causes for this:

-   Tools post processing the d.ts files incorrectly, for example [this bug in API-Extractor](https://github.com/microsoft/rushstack/issues/4507) which tents to impact code using our schema system.
-   TypeScript itself intentionally choosing to have differences like how it handles [private properties interacting with generics](https://github.com/microsoft/TypeScript/issues/20979).
-   TypeScript bugs where the d.ts file is incorrect, for example [this one](https://github.com/microsoft/TypeScript/issues/55832) which makes most ways to do recursive schema emit `any` instead of a recursive type reference.
-   TypeScript bugs where the emitted type does not even type check, like [this one](https://github.com/microsoft/TypeScript/issues/58688) and [this one](https://github.com/microsoft/FluidFramework/pull/21299) found using our schema system. There is also a similar such bug breaking recursive Array and Map node d.ts files which has not been root caused yet.

With so many of these issues impacting schema generated with our schema system, explicitly testing for them makes sense.
Testing for these however requires producing and validating d.ts files, both of which are things tests normally don't do.

Additionally errors like `error TS2742: The inferred type of 'Inventory' cannot be named without a reference to '../node_modules/@fluidframework/tree/lib/internalTypes.js'. This is likely not portable. A type annotation is necessary.` can occur when reexporting types imported from another package, but not when exporting references to types from the current compilation unit.

These also can't be tested for in regular tests.

To provide coverage for these cases, so extra configuration is required.

This could be done via extra packages.
A package could be created which declares and exports some schema.
A second additional package could then be added to attempt to consume that schema.
Instead of all the boilerplate needed to do this, this folder provides simpler solution using [TypeScript projects](https://www.typescriptlang.org/docs/handbook/project-references.html).
