# TypeBox 1.3.34 migration: performance and packaging findings

## Summary for TypeBox maintainers

We are migrating Fluid Framework's SharedTree from **`@sinclair/typebox` 0.34.13 to `typebox` 1.3.34**.
SharedTree is a collaborative tree data structure.
It uses TypeBox to describe serialized data and, when validation is enabled, to compile validators for that data.
Browser bundle size, schema construction, validator compilation, and repeated validation all matter to our consumers.

We found reproducible local performance regressions in three distinct phases.
We also evaluated a local packaging patch, then removed it because its measured benefit was small and it would not reach consumers of our published packages.
We would prefer fixes in TypeBox's public APIs and published package over maintaining our own modifier implementations.

| Finding | Evidence | Request |
| --- | --- | --- |
| [Optional/readonly modifiers deep-copy nested schemas](#1-optional-and-readonly-modifiers-deep-copy-nested-schemas) | Source inspection and identity reproduction; shallow copies greatly reduce our schema-construction cost | Offer an efficient shallow-copy path with documented sharing semantics |
| [Generated names change between identical compilations](#2-identical-compilations-generate-different-source) | Source reproduction; resetting names reduces repeated compilation from 15.4 to 7.9 ms | Make generated names local to each compilation |
| [Warm validation is slower](#3-warm-validation-is-slower) | Follow-up isolates regex key checks and general numeric checks; schema-only experiments restore baseline speed or better on four fixtures | Optimize fixed-key objects upstream; use integer declarations for integer-only data; evaluate a local `propertyNames` alternative |
| [Tree-shaking metadata improvement](#4-tree-shaking-support-needs-to-ship-in-the-package) | A now-removed local patch saved 389 gzip bytes without validation and 62 with validation | Consider appropriate side-effect metadata upstream; measured savings do not justify a local patch or a migration blocker |
| [Immutable mode leaves nested schema containers mutable](#5-immutabletypes-does-not-freeze-the-complete-schema-graph) | Direct freezing and mutation reproduction | Clarify the contract; consider graph immutability if this mode is intended to support safe sharing |

**Scope:** These are performance, packaging, and API-contract concerns.
Follow-up probes also found acceptance differences from 0.34.13, including near-integer numbers, sparse tuples, and non-JSON record inputs; see section 3.
The immutable-mode observation is a limitation relevant to sharing, not a demonstrated regression from 0.34.13.
All numerical results below are local measurements, not application-wide performance guarantees.

## Reproducing the small examples

The TypeBox reproductions in sections 1, 2, and 5 are independent.
Save each as an `.mjs` file in a project with `typebox@1.3.34` installed and run it with Node.js.
They demonstrate the source/identity/freezing behavior; they do not reproduce the SharedTree benchmark timings.
The investigation used Node.js 24.15.0.

## 1. Optional and readonly modifiers deep-copy nested schemas

### Observed behavior

Applying a modifier copies nested objects even though the modifier changes only outer schema metadata:

```javascript
import * as Type from "typebox/type";

const schema = Type.Object({ child: Type.Object({ value: Type.String() }) });
for (const modified of [Type.Optional(schema), Type.Readonly(schema)]) {
  console.log(modified === schema); // false
  console.log(modified.properties === schema.properties); // false
  console.log(modified.properties.child === schema.properties.child); // false
}
```

In the 1.3.34 distribution:

- `build/type/engine/optional/instantiate_add.mjs`: `AddOptionalAction` calls `Memory.Update` around an operation that also calls `Memory.Update`.
- `build/type/engine/readonly/instantiate_add.mjs`: `AddReadonlyAction` uses the same pattern.
- `build/system/memory/update.mjs`: `Memory.Update` recursively clones the input before applying changes.

Thus, these paths copy nested schemas twice.
The previous TypeBox optional modifier used a shallow copy under its default settings.

### Impact and workaround

Our initial migration used custom modifiers with one `Memory.Update` call, so it already avoided one of the public API's copies.
Replacing that remaining deep copy with an outer descriptor copy substantially reduced initialization cost:

| Workload, without coverage | 0.34.13 baseline | Initial migration: one deep copy | Experimental shallow copy |
| --- | ---: | ---: | ---: |
| Construct a sequence-change schema | About 2.2 microseconds | About 104 microseconds | About 7.3 microseconds |
| Warm tree creation with validation disabled | About 0.84 ms | About 1.94 ms | About 0.80 ms |

These are measurements of our schema-building paths, not a direct public-API benchmark.
The implemented [local helper](../../src/util/typebox.ts) subsequently measured about 8.2 microseconds for sequence-schema construction.
A separate modifier-only probe dropped from about 104 to 2.1 microseconds.
Neither result implies the same speedup for validator compilation or validation.

**The workaround has costs:** it depends on TypeBox's modifier keys and metadata representation, manually reproduces relevant settings behavior, and shares nested mutable objects.
Mutations through the original or modified schema can affect the other.
Copying property descriptors preserves hidden metadata that a plain object spread would lose, but does not remove the dependency on TypeBox's representation.

### Suggested change and regression tests

Provide shallow-copy behavior for these modifiers, or an explicit lightweight public API if changing aliasing behavior would be incompatible.
Apply the modifier and options in one outer copy.
Avoid changing `Memory.Update` globally without reviewing its other callers.

Tests should cover:

- No input mutation; documented nested-object identity and sharing.
- Preservation of hidden metadata, refinements, and other modifiers.
- Optional/readonly composition and repeated application.
- Frozen inputs, `immutableTypes`, and `enumerableKind`.
- Options precedence and unchanged inferred static types.

Our [modifier tests](../../src/test/util/typebox.spec.ts) cover the local workaround and provide a starting point.

## 2. Identical compilations generate different source

### Reproduction and likely cause

```javascript
import * as Type from "typebox/type";
import { Build } from "typebox/schema";

const schema = Type.Object(
  { value: Type.Optional(Type.String()) },
  { additionalProperties: false },
);

const first = Build(schema).Evaluate().Code();
const second = Build(schema).Evaluate().Code();
console.log(first === second); // false in 1.3.34
```

`build/schema/engine/_unique.mjs` uses a module-global counter to allocate names such as `var_0`.
`Build` resets other compiler state but not that counter.
Repeated builds therefore produce different identifiers.
The old compiler produced identical source for the same schema.

### Impact

| Recompile a fixed list of 88 SharedTree schemas, warm median | Time |
| --- | ---: |
| 0.34.13 | 3.7 ms |
| 1.3.34 | 15.4 ms |
| 1.3.34 with an experimental per-build counter reset | 7.9 ms |

The result strongly suggests that unstable source prevents V8 from reusing compiled code.
It does not directly measure cache hits or account for all remaining compilation overhead.

This is **not** a claim that TypeBox removed an explicit validator cache.
Fluid compiles once when constructing a codec and reuses the result for validation.
The repeated-compilation workload arises when constructing more trees and their codecs, not on every edit.

### Suggested change and regression tests

Use a build-local name allocator so the same schema and configuration produce stable source.
Check external bindings, references, and nested or reentrant compilation if supported.
Benchmark both first compilation and repeated compilation.

Caching validators by schema identity is a separate design choice.
It requires a contract for schema mutation and global settings; it should not replace fixing unstable generated source.
Even after resetting names, the remaining 7.9 ms versus 3.7 ms warrants profiling schema traversal, code generation, and function compilation separately.

## 3. Warm validation is slower

### Follow-up measurements

**Most of the measured regression can be avoided without relaxing validation.**
Two causes stand out: regular expressions for fixed property names, and general `multipleOf` checks for integer-only data.
Our local builder helpers are not responsible for the generated validation overhead in these fixtures.

The follow-up used actual schemas from the baseline and current Tree builds, with explicitly constructed payloads:

- Sequence: 100 insertion marks, each containing `count` and `effect.insert.id`, using the version 3 changeset schema.
- Detached index: 100 three-element revision entries, using the version 2 index schema.
- Stored schema: 100 object-node definitions, each containing one field, using the version 1 schema-index format.
- Recursive tree: a parent with 100 leaf children, each containing `type` and `value`.

Times are **microseconds per validation**, excluding construction and compilation.
The last column combines two experimental schema changes described below, with no TypeBox compiler patch.

| Valid payload | 0.34.13 | Current 1.3.34 | Ratio | `propertyNames` + integer declarations |
| --- | ---: | ---: | ---: | ---: |
| Sequence | 8.98 | 17.29 | 1.93x | 6.45 |
| Detached index | 1.26 | 2.40 | 1.90x | 1.05 |
| Stored schema | 27.12 | 28.89 | 1.07x | 25.49 |
| Recursive tree | 3.00 | 6.25 | 2.08x | 2.02 |

Invalid fixtures fail in the final item: a zero count, fractional root ID, non-string field kind, or non-string node type, respectively.

| Late-failing invalid payload | 0.34.13 | Current 1.3.34 | Combined schema changes |
| --- | ---: | ---: | ---: |
| Sequence | 8.94 | 17.46 | 6.46 |
| Detached index | 1.26 | 2.50 | 1.08 |
| Stored schema | 27.84 | 29.18 | 25.64 |
| Recursive tree | 3.07 | 6.30 | 2.06 |

These replace the earlier 1.3-4.0x timing examples for this section.
The original temporary fixtures were removed; the follow-up uses new, explicit payloads, so differences between the two investigations must not be attributed to the cache or helper changes.
Payload shape matters, and these are validator costs, not application-wide slowdown factors.

### Cause A: regex checks for known property names

For closed objects with optional fields, 1.3.34's `BuildAdditionalPropertiesStandard` in `build/schema/engine/additionalProperties.mjs` generates a regular expression from the declared keys and tests each own property name.
The old compiler used literal-key membership checks.
Both enumerate non-enumerable own string properties with `Object.getOwnPropertyNames`; the enumeration API is not new overhead in this comparison.

An isolated compiler experiment replaced only the generated regex test with a literal-array `includes` check when there were no pattern properties:

| Valid payload | Current | Literal-key compiler experiment |
| --- | ---: | ---: |
| Sequence | 17.29 | 8.91 |
| Detached index | 2.40 | 2.41 |
| Stored schema | 28.89 | 26.45 |
| Recursive tree | 6.25 | 3.07 |

This accounts for nearly all the sequence and recursive-tree regression in these fixtures.
The experiment preserves key enumeration and does not permit additional keys.
General regex support is useful for `patternProperties`, but these closed objects do not need it.
An upstream specialized literal-key path is preferable to a consumer compiler patch.

**Schema-only alternative:** replace `additionalProperties: false` with a `propertyNames` enum for an object whose permitted keys are exactly its declared properties:

```javascript
import * as Type from "typebox/type";

const properties = {
  id: Type.Integer(),
  revision: Type.Optional(Type.String()),
};
const schema = Type.Object(properties, {
  propertyNames: { enum: Object.keys(properties) },
});
```

The enum generates direct equality comparisons rather than regex calls.
In isolation, this reduced sequence validation to 7.18 microseconds and recursive validation to 2.12 microseconds.
It retains the prohibition on extra keys; simply dropping `additionalProperties: false` without the enum would not.

The experiment was restricted to closed objects with optional properties, no pattern properties, no existing `propertyNames`, and no unevaluated-property tracking.
It is not a proposed general schema-rewriting pass.
Diagnostic paths change, and annotation interactions need review before using this technique more broadly.
Prefer an upstream fixed-key optimization if adding another Fluid schema workaround is not worthwhile.

### Cause B: integer declarations take the general multiple-of path

Several Fluid schemas use `Type.Number({ multipleOf: 1 })` for counts and identifiers.
In 1.3.34, this generates a finite-number check plus a call to `Guard.IsMultipleOf`.
`Type.Integer()` generates `Number.isInteger` instead.
Preserving existing bounds while changing only these integer constraints reduced detached-index validation from 2.40 to 1.09 microseconds.
It had a smaller effect on sequence validation, from 17.29 to 16.32 microseconds.

This is also a semantic issue, not just a faster spelling:

| Constraint and input | 0.34.13 | 1.3.34 |
| --- | --- | --- |
| `multipleOf: 0.1`, value `0.3` | Reject | Accept |
| `multipleOf: 1`, value `1.00000000001` | Reject | Accept |
| `multipleOf: 1`, value `0.00000000001` | Reject | Accept |
| `integer`, value `1.00000000001` | Reject | Reject |

The new helper uses a tolerance of `1e-10`.
It handles floating-point decimal multiples more permissively, which explains some additional functionality, but also admits near-integer values where Fluid intends integral counts and IDs.
For those fields, `integer` restores the old rejection behavior rather than weakening it.
Do not replace general fractional `multipleOf` constraints indiscriminately.
Branded integer fields also need to preserve their static brands and numeric bounds.

**Implemented follow-up:** Fluid's integer-only `multipleOf: 1` declarations now use `Type.Integer`, including sandbox transport fields.
The `brandedIntegerType` helper preserves branded static types, and regression tests cover near-integer rejection and numeric bounds.
General number schemas are unchanged.
The tables above retain the pre-fix measurements so the effect of this change remains visible; the `propertyNames` alternative is still experimental.

### Local helpers are not the cause

In separate processes, we replaced the local optional/readonly helpers with public `Type.Optional` and `Type.Readonly`.
We then also replaced the interface and record helpers with public `Type.Interface` and `Type.Record`.
For all four fixtures, both substitutions produced identical:

- Serialized schema JSON.
- Generated validator source after normalizing temporary variable names.
- External compiler constants, including regex patterns and flags.

Validation timings remained comparable to the unmodified 1.3.34 validators.
The helpers change construction cost, not the generated checks for these schemas.
This is fixture-specific evidence, not proof for every possible use of the helpers.

### Other checks and correctness probes

Removing optional-property presence guards, removing selected redundant required-property guards, or replacing tuple extra-item iteration with a `maxItems` schema constraint did not produce a useful general speedup in the initial isolated runs.
Some changes slowed the detached-index workload.
Extra generated code is not necessarily expensive after JIT optimization; those paths should not be prioritized based on source size alone.

The correctness probes found other differences that are not evidence of stronger checking:

- A two-number tuple with values `[1, 2]` and `length` extended to 3, leaving a hole, is rejected by 0.34.13 but accepted by 1.3.34.
  The new extra-item `every` check skips holes.
- A string-keyed numeric record rejects `Date` and `Uint8Array` inputs in 0.34.13 but accepts the tested instances in 1.3.34.
  This also occurs with public builders, not just the local record helper.

These inputs are not ordinary JSON payloads, but should be considered when checking compatibility with in-memory codec inputs.
They were not changed as part of this investigation.

The follow-up ran 1,176 deterministic mutations of the four real fixtures.
The current validator's 17 differences from the baseline were near-integer acceptance cases; using integer declarations eliminated those differences in this corpus.
An additional 5,500 object checks found no acceptance differences between the original closed-object schemas and the `propertyNames` alternative, including unusual, inherited, and non-enumerable keys.
These checks support further testing; they do not prove equivalence for every JavaScript value, proxy, schema, or global setting.

### Follow-up method and recommendation

The follow-up compared baseline commit `97f7061ed43804399da0479b3995ffb5f3e6c186` with `ada71d30724` plus the working-tree validator cache.
It used unpatched TypeBox 1.3.34, Node.js 24.15.0, no coverage, and validators compiled before timing.
The cache cannot remove per-check work; this benchmark deliberately excludes compilation and cache lookup.
All new validators were accelerated and did not use unevaluated-property tracking.

Each result is the median of three fresh-process medians, including reversed execution orders.
Each process used 10,000 warmup checks and seven batches of 10,000 checks, cycling through 16 distinct payloads.
The follow-up scripts, generated validators, and results were retained in the investigation session, but are not a checked-in repository benchmark suite.
Compiler experiments used process-local loader substitutions, not edits to installed dependencies.
No production schema changes were made.

Recommended next steps:

1. Prefer integer declarations for integer-only fields, with compatibility tests for near-integers, bounds, and branding.
2. Propose a specialized fixed-key object path upstream.
3. If a local mitigation is needed sooner, evaluate the narrowly scoped `propertyNames` alternative with codec and snapshot tests.
4. Keep the tuple and non-JSON acceptance differences in the migration compatibility assessment.
5. Remeasure startup separately after any declaration changes; faster checking does not establish cheaper compilation or smaller bundles.

## 4. Tree-shaking support needs to ship in the package

### Packaging concern

The local dependency patch evaluated below added this package metadata:

```json
{
  "sideEffects": ["./build/format/_registry.mjs"]
}
```

The exception preserves built-in format registration.
The patch was applied by our root pnpm configuration; applications installing a published Fluid package would **not** automatically receive it.
We have removed the patch so workspace builds use the same unpatched TypeBox package as consumers.
Its measured savings were small, and the default SharedTree bundle was smaller than the baseline without it.
The validation-enabled bundle's small gzip regression remains; the patch did not eliminate it.
The patched measurements below are retained as historical evidence, not the current workspace configuration.

Existing upstream tracking: [sinclairzx81/typebox#1617](https://github.com/sinclairzx81/typebox/issues/1617).
We have not verified its current resolution status in a published package.

### Measured SharedTree bundle sizes

**These measurements do not show a large bundle-size regression.**
The default SharedTree bundle became smaller even without the patch.
Including validation produced a small gzip regression despite a reduction in uncompressed size.

We bundled the existing [SharedTree bundle-size entry](../../../../../examples/utils/bundle-size-tests/src/sharedTree.ts), which exports `SharedTree` from `fluid-framework`.
A second entry exports both `SharedTree` and `FormatValidatorBasic` to retain the optional validator.
These are complete bundles of those exports and their runtime dependencies, not isolated TypeBox snippets.

All sizes below are **bytes**.
The gzip delta compares each result with its scenario's 0.34.13 baseline.

| Exported APIs | TypeBox configuration | Minified JavaScript | Gzip, level 9 | Gzip delta from baseline |
| --- | --- | ---: | ---: | ---: |
| SharedTree | 0.34.13 baseline | 411,472 | 117,372 | - |
| SharedTree | 1.3.34, unpatched | 404,356 | 115,572 | -1,800 (-1.53%) |
| SharedTree | 1.3.34, patched | 403,475 | 115,183 | -2,189 (-1.87%) |
| SharedTree + validation | 0.34.13 baseline | 461,453 | 128,051 | - |
| SharedTree + validation | 1.3.34, unpatched | 454,722 | 128,947 | +896 (+0.70%) |
| SharedTree + validation | 1.3.34, patched | 454,428 | 128,885 | +834 (+0.65%) |

Isolating the metadata patch, with identical application and TypeBox code:

| Exported APIs | Minified bytes saved by patch | Gzip bytes saved by patch |
| --- | ---: | ---: |
| SharedTree | 881 (0.22%) | 389 (0.34%) |
| SharedTree + validation | 294 (0.06%) | 62 (0.05%) |

The patch therefore helps, but does not remove the small gzip regression when validation is included.
It is not responsible for the overall size reduction in the default bundle.
The baseline-to-upgrade comparison includes Fluid's migration changes and local modifier helpers; it does not isolate the cost of substituting the TypeBox package alone.

### Methodology and reproducibility

Measured on October 9, 2026 with Node.js 24.15.0, TypeScript 6.0.3, Webpack 5.109.0, `terser-webpack-plugin` 5.3.15, and Terser 5.37.0.

1. Compile the baseline Tree sources at `97f7061ed43804399da0479b3995ffb5f3e6c186` and the migration sources at `2c0f6be801c` as ES modules.
   Hold the compiler, generated package version, and all other installed workspace dependencies constant.
   The migration includes the shallow-copy modifier workaround.
2. Use the existing SharedTree entry, with its TypeScript annotation erased.
   For the validation scenario, use this entry:

   ```javascript
   import { SharedTree } from "fluid-framework";
   import { FormatValidatorBasic } from "@fluidframework/tree/internal";

   export function apisToBundle() {
     return { SharedTree, FormatValidatorBasic };
   }
   ```

3. Alias Tree's entry points to the appropriate compiled source tree.
   Use installed `@sinclair/typebox` 0.34.13 for the baseline.
   For the migration, alias `typebox` and its subpaths to an isolated copy of 1.3.34.
   Reconstruct unpatched metadata by removing only the `sideEffects` field added by our patch, then restore it for the patched measurement.
   Do not modify the shared installation.
4. Use production Webpack browser bundles with the repository's resolver settings, no externals, no source maps, and the same `bundle.js` output name.
   Use default Terser minification with worker parallelism disabled.
   Read the emitted JavaScript byte length and compress it using Node's `gzipSync` with `level: 9`.
   Source maps and separately emitted license files are not included.
5. Verify the emitted module graph uses the intended Tree and TypeBox versions.
   Evaluate every bundle and check its exported APIs.
   In the 1.3.34 validation bundles, compile an email-format schema and check that valid email passes and invalid email fails, both with and without the patch.

All these checks passed.
Repeated patched builds produced identical byte counts and gzip sizes for both scenarios.

**Limits:** this is a controlled local comparison of representative export bundles, not an install of packed Fluid packages into a fresh customer application.
It uses the current workspace's other dependencies and Fluid's custom modifiers, not TypeBox's public modifiers throughout.
Different application exports, dependency versions, bundlers, or compression settings can produce different results.

### Relation to the earlier modifier-only experiment

The earlier minimal object-schema probe, using public optional/readonly modifiers and our metadata patch, measured 2,943 minified bytes / 1,082 gzip bytes.
Using our helpers instead measured 1,512 / 739 bytes.
Those are different entry points from the SharedTree bundles above and must not be treated as their TypeBox contribution or patch savings.
Webpack removed unused general type-instantiation machinery in that probe; imports into the machinery do not establish that it survives tree shaking.

### Suggested change and verification

Publish accurate side-effect metadata, auditing required initialization rather than marking everything side-effect-free.
Test public entry points such as `typebox/type` and verify built-in format validation in optimized bundles.
The measurements support this packaging improvement, but do not justify claiming a large consumer bundle regression or a large benefit from our patch.
Fluid should still verify representative customer applications using the released package in clean installations without workspace patches.

## 5. `immutableTypes` does not freeze the complete schema graph

### Reproduction

```javascript
import * as Type from "typebox/type";
import { Settings } from "typebox/system";

const previous = Settings.Get();
try {
  Settings.Set({ immutableTypes: true });
  const schema = Type.Object({ value: Type.String() });
  console.log(Object.isFrozen(schema)); // true
  console.log(Object.isFrozen(schema.properties)); // false
  console.log(Object.isFrozen(schema.required)); // false

  schema.properties.extra = Type.Number();
  schema.required.push("extra");
  console.log("extra" in schema.properties); // true
  console.log(schema.required.includes("extra")); // true
} finally {
  Settings.Set(previous);
}
```

### Why it matters

In 1.3.34, `Freeze` applies `Object.freeze` to the outer result.
Enabling `immutableTypes` does not change deep-copy behavior in `Memory.Update`, freeze the complete graph, or guarantee that supplied schemas were created with the setting enabled.
It controls schema objects, not the validated application data or readonly static types.
Fluid does not enable this setting in production.

**Request:** clarify whether shallow freezing is the intended contract.
If this mode is intended to make structural sharing safe, a graph-immutability guarantee would be more useful.
That would require an explicit policy for pre-existing inputs and nested containers, not just changing the modifier copy operation.
An explicit shallow-copy API with a documented caller obligation is also viable; recursive freezing is not a prerequisite for that API.

## Measurement context and limitations

### Versions and code states

Investigation date: October 9, 2026.
Migration PR: [microsoft/FluidFramework#28422](https://github.com/microsoft/FluidFramework/pull/28422).

| State | Fluid commit | Meaning |
| --- | --- | --- |
| Baseline | `97f7061ed43804399da0479b3995ffb5f3e6c186` | TypeBox 0.34.13 |
| Initial migration | `706cb4fbb2b71acf8be98af08b5c1779b13eacaa` | TypeBox 1.3.34, local metadata patch, one-copy modifier helpers |
| Implemented shallow-copy workaround | `2c0f6be801c` | Descriptor-copy modifiers and regression tests; no compiler-name fix |

The initial application measurements used separately compiled baseline and migration sources with existing workspace dependencies, native Node.js 24.15.0, serial processes, and repeated runs in reversed order.
Production emulation disabled debug assertions for initialization and microbenchmarks.
Warm initialization used 10 warmups and 50 samples.
The initial valid-input validation investigation used seven batches of 20,000 checks with varied payload objects; section 3 documents the separate follow-up protocol.
Coverage measurements were separate.

Counter resets and the initial shallow-copy comparisons used temporary experimental modifications.
After implementing the actual helper, compilation, lint, 25 focused tests, and modifier/schema-construction microbenchmarks were rerun.
**The complete performance matrix has not been rerun against that final helper with copying as the only variable.**
The original temporary runtime-performance harnesses were removed.
The section 3 follow-up retains its scripts and results in the investigation session, but neither investigation is a checked-in benchmark suite.
Packaging standalone fixtures and harnesses for upstream use remains follow-up work.

### Application startup and validation defaults

In the initial measurements, constructing a tree with validation enabled built codecs for supported data-format versions and made 88 validator compilation requests:

| Tree initialization, excluding imports and coverage | Baseline | Initial migration |
| --- | ---: | ---: |
| First creation | 30-31 ms | 55-56 ms |
| Warm creation, median | 5.2-5.7 ms | 18.1-18.4 ms |

The name-reset experiment reduced warm initialization to about 11.4 ms; adding experimental shallow copies reduced it to about 10.1 ms.
Neither restored baseline performance.
These startup measurements predate the working-tree schema-identity cache; its initialization benefit has not been measured here.

By default, SharedTree disables validation (`FormatValidatorNoOp`), but still constructs schemas.
Those consumers benefit from cheaper modifiers without incurring TypeBox compilation or checking.
Consumers that enable validation (`FormatValidatorBasic`) incur all three phases.
[Codec construction](../../src/codec/codec.ts) compiles validators once and reuses them; validation does not rebuild them.

### CI symptoms are not the primary evidence

The investigation began with three memory benchmarks exceeding a 2,000 ms timeout in [coverage build 427665](https://dev.azure.com/fluidframework/public/_build/results?buildId=427665&view=ms.vss-test-web.build-test-results-tab).
They took 2,236/2,260/2,240 ms; earlier branch build 427619 passed them at 1,397/1,470/1,567 ms.
Locally, the same tests passed without instrumentation at 333/153/111 ms on the baseline and 379/184/145 ms on the initial migration.

**Local slowdowns were reproduced; the two-second CI timeout was not reproduced in isolation.**
Coverage, process concurrency, and explicit garbage collection in the memory harness affect those tests.
Reduced copying plausibly lowers garbage-collection pressure, but that contribution was not isolated.
The evidence is from Node.js, not a browser or a complete production application.

## Proposed next steps

**For TypeBox discussion:** agree on modifier sharing semantics, deterministic compilation, the freezing contract, and package side-effect metadata.
The examples above can become small regression tests.
Investigate validation-code optimizations once standalone representative workloads are available.

**For Fluid:** retain reduced benchmark fixtures; rerun the exact candidate release without local dependency patches; measure full consumer bundles; and run codec, persisted-format compatibility, refinement, snapshot, and coverage tests.
Isolate each optimization before combining them, and agree on explicit performance and bundle-size budgets for any remaining regression.

Our recommendation is to hold this migration until the customer-impacting issues are fixed in a published dependency or the remaining tradeoffs are explicitly accepted.
This is a proposed Fluid merge gate, not a configured pipeline gate or a request for TypeBox to adopt Fluid-specific performance guarantees.
