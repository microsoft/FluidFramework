# Cross-Package SharedTree Schema Example

This example demonstrates a pattern for consuming SharedTree schemas across package boundaries
when those schemas are defined using `SchemaFactoryAlpha.objectAlpha()`.

## The Problem

When SharedTree schema classes are defined using `objectAlpha()` and compiled with
TypeScript 5.9+ using `moduleResolution: "bundler"`, the `.d.ts` emitter normalizes import
paths in a way that breaks cross-package consumption.

## The Solution

Use TypeScript 5.0+ `customConditions` with a `"source"` export condition in the provider's
`package.json`, so TypeScript resolves `.ts` source files directly instead of `.d.ts`.

### Provider side (`schema-provider`)

Add a `"source"` condition to `package.json` exports:

```json
"exports": {
  ".": {
    "source": "./src/index.ts",
    "import": {
      "types": "./lib/index.d.ts",
      "default": "./lib/index.js"
    }
  }
}
```

### Consumer side (`schema-consumer`)

Add `customConditions` to `tsconfig.json`:

```json
{
  "compilerOptions": {
    "customConditions": ["source"]
  }
}
```

## Verification

### Step 1: Build the provider with bundler resolution (simulates Loop's setup)

```bash
cd schema-provider
npm run build:bundler    # Uses TypeScript 5.9 + moduleResolution: "bundler"
```

This generates `.d.ts` files where `ObjectNodeSchema` references are normalized to
`import("@fluidframework/tree")` instead of `import("@fluidframework/tree/alpha")`.

### Step 2: Check the consumer with `customConditions: ["source"]` (success path)

```bash
cd schema-consumer
npm run check:source-condition    # tsc with customConditions: ["source"]
```

Passes because `customConditions: ["source"]` causes TypeScript to resolve the provider's
`.ts` source directly, bypassing the broken `.d.ts`.

### Step 3: Check the consumer without `customConditions` (failure path)

```bash
cd schema-consumer
npm run check:no-source-condition    # tsc without customConditions
```

Fails with:
```
TS2694: Namespace has no exported member 'ObjectNodeSchema'.
TS2322: Type 'typeof AppState' is not assignable to type 'ImplicitFieldSchema'.
```

This proves the `.d.ts` path normalization issue is real.

## Packages

- **`schema-provider`** — Defines schemas via `objectAlpha()`, exports with `"source"` condition
- **`schema-consumer`** — Imports schemas, uses `customConditions: ["source"]` in tsconfig
