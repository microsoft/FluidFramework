---
"fluid-framework": minor
"__section": breaking
---
Container APIs use Fluid-owned collection types

The aggregated Tree and SharedMap APIs now use Fluid-owned collection and iterator interfaces instead of TypeScript's built-in container types.
This prevents changes to TypeScript's standard library from introducing unintended requirements for Fluid implementations.

#### Migration

Most existing assignments remain structurally compatible.
Methods available only on newer built-in collection types are not available on Fluid containers.
