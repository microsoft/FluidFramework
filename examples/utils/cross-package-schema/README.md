# Cross-Package SharedTree Schema Example

This example demonstrates a pattern for consuming SharedTree schemas across package boundaries
when those schemas are defined using `SchemaFactoryAlpha.objectAlpha()`.

## The Problem

When SharedTree schema classes are defined using `objectAlpha()` and compiled with
TypeScript 5.9+ using `moduleResolution: "bundler"`, the `.d.ts` emitter normalizes import
paths in a way that breaks cross-package consumption.

## The Solution

Add a `/schema` subpath export in the provider's `package.json` whose `"types"` field
points directly to the `.ts` source.

### Provider side (`schema-provider`)

Add a `"./schema"` subpath to `package.json` exports:

```json
"exports": {
  ".": {
    "import": {
      "types": "./lib/index.d.ts",
      "default": "./lib/index.js"
    }
  },
  "./schema": {
    "types": "./src/index.ts", // <--- .ts source
    "default": "./lib/index.js"
  }
}
```

### Consumer side (`schema-consumer`)

Import from the `/schema` subpath

```typescript
import { AppState } from "@my-provider/schema";
```

## Verification

### Step 1: Build the provider with bundler resolution

```bash
cd schema-provider
npm run build:bundler    # Uses TypeScript 5.9 + moduleResolution: "bundler"
```

This generates `.d.ts` files where `ObjectNodeSchema` references are normalized to
`import("@fluidframework/tree")` instead of `import("@fluidframework/tree/alpha")`.

### Step 2: Check the `/schema` subpath import (success path)

```bash
cd schema-consumer
npm run check:schema-import
```

Passes because the consumer imports from the `/schema` subpath, which resolves
types directly from the provider's `.ts` source, bypassing the broken `.d.ts`.

### Step 3: Check the direct `.` import (failure path)

```bash
cd schema-consumer
npm run check:direct-import
```

Fails with:
```
TS2694: Namespace has no exported member 'ObjectNodeSchema'.
TS2322: Type 'typeof AppState' is not assignable to type 'ImplicitFieldSchema'.
```

This compiles `consume-direct.ts`, which imports from the `.` export (resolving
through `.d.ts`) instead of the `/schema` subpath, demonstrating the breakage.

## Packages

- **`schema-provider`** — Defines schemas via `objectAlpha()`, exposes a `/schema` subpath with types from `.ts` source
- **`schema-consumer`** — Imports schemas from `/schema` subpath, no special tsconfig needed
