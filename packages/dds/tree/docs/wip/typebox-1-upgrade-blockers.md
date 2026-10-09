# TypeBox 1 upgrade blockers and proposed upstream fixes

## Status and scope

**Recommendation: hold the TypeBox 1 update until the customer-impacting issues below are fixed upstream or explicitly accepted with measured evidence.**
This document records a proposed merge gate; it does not configure a pipeline gate.

The investigation on October 9, 2026 compared:

- Baseline: `97f7061ed43804399da0479b3995ffb5f3e6c186`, using `@sinclair/typebox` 0.34.13.
- Upgrade: `706cb4fbb2b71acf8be98af08b5c1779b13eacaa`, using `typebox` 1.3.34.
- Follow-up working-tree changes: shallow-copy optional and readonly helpers in [typebox.ts](../../src/util/typebox.ts), with [regression tests](../../src/test/util/typebox.spec.ts).
- Pull request: [microsoft/FluidFramework#28422](https://github.com/microsoft/FluidFramework/pull/28422).

The runtime measurements below are local results, not performance guarantees for every application.
They separate schema construction, validator compilation, and validation.
Improvements to one phase must not be assumed to improve the others.

## Issue summary

| Issue | Customer impact | Proposed fix |
| --- | --- | --- |
| Tree-shaking relies on a repository-local dependency patch | Our bundle measurements do not necessarily describe customers' installations | Publish correct side-effect metadata in TypeBox; verify an unpatched consumer installation |
| Optional and readonly modifiers deep-copy nested schemas | More initialization work and allocations, even with validation disabled | Provide lightweight, shallow-copy modifiers with an explicit sharing contract |
| Generated variable names change between identical compilations | Repeated validator compilation loses JavaScript-engine code-cache reuse | Reset generated-name allocation for each build, preferably using build-local state |
| Generated validators perform more work | Higher validation cost with `FormatValidatorBasic` | Restore specialized tuple, object, and numeric-check fast paths while preserving semantics |
| Schema generation and compilation still have overhead after targeted fixes | Startup remains slower after fixing copying and generated names | Profile the remaining work using actual SharedTree schemas and a retained benchmark suite |
| Local helpers depend on TypeBox's metadata representation | Additional maintenance and compatibility risk | Make the public TypeBox APIs efficient enough to remove our substitutes |

The `immutableTypes` setting is not a solution to these issues.
Its limitations and possible upstream improvements are described below.

## 1. Ship tree-shaking support to customers

### Evidence

The [TypeBox dependency patch](../../../../../patches/typebox@1.3.34.patch) adds:

```json
{
  "sideEffects": ["./build/format/_registry.mjs"]
}
```

The exception preserves built-in format registration.
The patch is applied by our pnpm workspace configuration.
It does **not** automatically modify the TypeBox package installed by an application that consumes a published Fluid package.

The existing upstream tracking issue is [sinclairzx81/typebox#1617](https://github.com/sinclairzx81/typebox/issues/1617).
Its resolution must be verified in a published package, not just in an upstream source branch.

There is an important limit to the earlier bundle-size diagnosis.
The public optional and readonly APIs have imports into TypeBox's general type-instantiation engine, but that alone does not prove the engine survives tree shaking.
A production Webpack probe using our patched dependency produced:

| Minimal object schema using optional and readonly fields | Minified bytes | Gzip bytes |
| --- | ---: | ---: |
| Public TypeBox modifiers | 2,943 | 1,082 |
| Local shallow-copy helpers | 1,512 | 739 |

In that configuration, Webpack removed the unused general instantiation machinery.
These numbers do not establish a large bundle penalty from the public modifiers, nor do they measure a complete customer application.
They also do not establish behavior without our patch or with other bundlers.

### Suggested upstream fix and acceptance criteria

- Publish accurate side-effect metadata in TypeBox, retaining the format-registry initialization.
- Keep simple builders and modifiers independent of unrelated runtime initialization where practical.
- Test public entry points such as `typebox/type` with supported bundlers.
- Compare an actual Fluid consumer bundle before and after the upgrade, using the published TypeBox package without workspace patches.
- Verify built-in format validation still works in the optimized bundle.

The local patch is useful for experiments, but is not a customer-facing delivery mechanism for this fix.

## 2. Avoid deep copies for optional and readonly modifiers

### Evidence

In TypeBox 1.3.34, the public modifier paths are:

- `Optional` -> `AddOptional` -> `AddOptionalAction`.
- `Readonly` -> `AddReadonly` -> `AddReadonlyAction`.

Each action invokes `Memory.Update` twice.
`Memory.Update` calls `Clone`, which recursively copies nested schema objects.
The previous TypeBox optional modifier used a shallow copy under its default settings.

The branch initially replaced the public modifiers with helpers that called `Memory.Update` once.
That avoided some overhead but still deep-copied nested schemas.
The follow-up [withTypeModifier helper](../../src/util/typebox.ts) instead copies outer property descriptors and shares nested objects.
This preserves non-enumerable metadata that a plain object spread would lose.

Measured without coverage:

| Workload | Before removing deep copies | Shallow-copy experiment |
| --- | ---: | ---: |
| Construct a sequence-field schema | About 104 microseconds | About 7.3 microseconds |
| Warm Tree creation with `FormatValidatorNoOp` | About 1.94 milliseconds | About 0.80 milliseconds |

For comparison, the pre-upgrade results were about 2.2 microseconds and 0.84 milliseconds, respectively.
After implementing the actual helper, a separate modifier-only probe dropped from about 104 microseconds to 2.1 microseconds for either modifier on a representative sequence schema.
The actual helper's sequence-schema construction measured about 8.2 microseconds.
These are different workloads; the modifier-only speedup is not an application-wide speedup.

### Suggested upstream fix

Provide a lightweight path for optional and readonly modifiers that:

- Copies only the outer schema object.
- Preserves existing hidden metadata, including refinements and other modifiers.
- Applies the modifier and options without multiple copies.
- Does not mutate the input.
- Clearly documents that nested schemas are shared.
- Preserves the documented freezing and metadata-enumerability behavior.

Changing `Memory.Update` globally would affect much more than these modifiers.
A scoped modifier change, or an explicit public shallow-copy API, is safer.
Changing existing aliasing semantics requires an upstream compatibility decision.

The current local helper is a workaround, not the preferred long-term API.
Use the [modifier tests](../../src/test/util/typebox.spec.ts) as a starting point for upstream tests, including nested identity, refinement validation, composition, repeated modifiers, and frozen schemas.

## 3. Generate stable source for identical validator compilations

### Evidence

TypeBox 1.3.34's `build/schema/engine/_unique.mjs` keeps a module-global counter:

```javascript
let index = 0;
export function Unique() {
  return `var_${index++}`;
}
```

`Build` resets other compiler state but does not reset this counter.
Compiling the same schema twice therefore generates different source.
The old compiler produced identical source.

Minimal reproduction using the public API:

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

The changing identifiers prevent reuse that V8 can perform for identical generated function source.
A controlled experiment that reset the counter for each build reduced repeated compilation of the same 88 SharedTree schemas from about **15.4 milliseconds to 7.9 milliseconds**.
The old compiler took about **3.7 milliseconds**.

This is not evidence that Fluid removed an explicit validator cache.
[withSchemaValidation](../../src/codec/codec.ts) still compiles once when constructing a codec and reuses that validator for encode and decode.
Both TypeBox versions rebuild validators when asked to compile again.
The lost reuse is at the JavaScript-engine level.

### Suggested upstream fix

- Make generated names deterministic for a given schema and compilation configuration.
- Prefer build-local name allocation rather than a process-global mutable counter.
- Test repeated compilation and, if supported, nested or reentrant compilation.
- Benchmark repeated compilation as well as the first compilation.
- Check that external bindings and references still point to the correct objects.

Returning a cached validator solely by schema identity is a separate design decision.
It requires a contract for schema mutation and relevant global settings.
It should not be introduced as an unqualified substitute for fixing unstable generated code.

## 4. Reduce the cost of generated validation code

### Evidence

The regression is not just initialization.
Warm validation of representative valid encoded payloads, without coverage, measured:

| Payload | TypeBox 0.34.13 | TypeBox 1.3.34 | Approximate cost ratio |
| --- | ---: | ---: | ---: |
| Sequence change with 100 marks | 8.7 microseconds | 25.2 microseconds | 2.9x |
| Detached index with 100 revisions | 0.39 microseconds | 1.55 microseconds | 4.0x |
| Stored schema with 100 nodes | 32.6 microseconds | 41.0 microseconds | 1.3x |
| Recursive tree with 100 children | 2.7 microseconds | 6.1 microseconds | 2.3x |

Late-failing invalid payloads also ran more slowly.
These are isolated validator costs, not whole-operation slowdown factors.

The new validators reported `IsAccelerated() === true`.
They did not fall back to interpreted checking.
The measured schemas did not require unevaluated-property tracking.

Inspection of generated source identified extra work:

- Fixed tuples use additional array iteration and per-element length guards where the old compiler used an exact-length check and direct element checks.
- Required object properties receive explicit presence checks even where the value checks may already reject absence.
- Additional-property checks can use regular expressions instead of the old compiler's property-name checks.
- Numeric constraints use more general helper functions instead of some of the old direct arithmetic checks.

These observations identify optimization candidates, not independently measured contributions to each slowdown.
Resetting generated names and removing deep copies did not materially improve the measured warm validation throughput.

Using `Compile` from `typebox/compile` instead of `Build(...).Evaluate()` is not a fix.
The higher-level validator uses the same `Build` and `Evaluate` implementation, with additional functionality.

### Suggested upstream fix

- Add specialized fixed-tuple code generation that combines length and item constraints where equivalent.
- Eliminate redundant object presence checks only when the property schema necessarily rejects a missing value.
- Benchmark small fixed-key objects before choosing regular expressions for additional-property checks.
- Specialize common integer constraints where this preserves the intended numeric semantics.
- Retain correct handling of optional `undefined`, sparse arrays, unions, references, refinements, and non-JSON values allowed by Fluid's codec contracts.
- Benchmark both valid payloads and invalid payloads that fail early or late.

Optimization must not change persisted-format acceptance accidentally.
Existing correctness and snapshot tests should accompany performance tests.

## 5. Account for residual startup cost and production defaults

Without coverage, Tree creation with `FormatValidatorBasic` measured:

| Measurement | Baseline | Upgrade before the shallow-copy follow-up |
| --- | ---: | ---: |
| First Tree creation, excluding module imports | 30-31 milliseconds | 55-56 milliseconds |
| Warm Tree creation, median | 5.2-5.7 milliseconds | 18.1-18.4 milliseconds |

Both versions compiled 88 validators per Tree in this configuration.
Codecs for supported format versions are built during initialization; this is not 88 compilations on each edit.

Resetting generated names reduced warm Tree creation to about 11.4 milliseconds.
Adding the experimental shallow-copy modifier reduced it further to about 10.1 milliseconds.
That remained above the baseline.
The combined experiment did not isolate every remaining source of compiler overhead.

[Default SharedTree options](../../src/shared-tree/sharedTree.ts) use `FormatValidatorNoOp`.
Default consumers therefore avoid the TypeBox validator compilation and checking costs.
They still construct codec schemas, so unnecessary copying affects them too.
Consumers that select `FormatValidatorBasic` incur all three phases.

### Suggested follow-up

- Profile schema construction and code generation separately from JavaScript function compilation.
- Keep benchmarks for actual SharedTree schema families, not just small synthetic objects.
- Consider safe sharing or caching of immutable schemas and compiled validators as a separate optimization.
- Do not use a timeout increase as evidence that the startup regression is resolved.

## 6. Clarify the immutable-types contract

TypeBox's `immutableTypes` setting defaults to `false`.
SharedTree does not enable it in production code; the new modifier tests exercise both settings for compatibility.
It controls freezing of schema objects, not readonly application data and not validation acceleration.

In 1.3.34, `Freeze` applies `Object.freeze` to the outer object.
The setting:

- Does not make `Memory.Update` shallow-copy.
- Does not recursively freeze the complete schema graph.
- Does not freeze an object schema's `properties` map or `required` array.
- Does not establish that an input schema was created while the setting was enabled.

Consequently, it is not a sufficient safety guarantee for unrestricted structural sharing.
An upstream immutable-schema mode could support structural sharing, but would need a clear graph-immutability contract.
That is a possible design improvement, not a prerequisite to selecting an explicit shallow-copy contract for our internal schemas.

## CI symptoms and measurement limits

[Build 427665](https://dev.azure.com/fluidframework/public/_build/results?buildId=427665&view=ms.vss-test-web.build-test-results-tab) failed three local TableSchema memory benchmarks in the coverage job:

| Scenario, all with table size 3 | Failure duration |
| --- | ---: |
| Undo insertion of a column and row three times | 2,236 milliseconds |
| Undo insertion and immediate removal of a column and row three times | 2,260 milliseconds |
| Undo batch removal of three rows | 2,240 milliseconds |

All exceeded Mocha's 2,000-millisecond timeout.
The same tests passed on earlier branch build 427619 at 1,397, 1,470, and 1,567 milliseconds.
Nearby other PRs were faster, but cross-build timing is not a controlled comparison.

The local investigation used:

- Separately compiled baseline sources and branch sources, with existing workspace dependencies.
- Node.js 24.15.0 for the controlled production-cost investigation.
- Serial processes, with repeated runs in reversed order.
- Production emulation for initialization and microbenchmarks.
- Warmup followed by 50 initialization samples or multiple microbenchmark batches.
- Multiple valid input objects rather than a single constant payload.
- Separate V8-coverage runs to distinguish coverage overhead.

The exact three tests passed locally without instrumentation at 333/153/111 milliseconds on the baseline and 379/184/145 milliseconds on the branch before the shallow-copy follow-up.
Coverage increased local costs further.
The memory benchmark harness also performs explicit garbage collection, making these tests sensitive to the rest of the process heap.

**The local slowdown was reproduced; the actual two-second CI timeout was not reproduced in isolation.**
Reduced allocation should reduce garbage-collection pressure, but its isolated contribution was not quantified.
The measurements are from Node.js, not a browser or a complete production application bundle.

The initial compiler/validation comparisons used the committed upgrade before the shallow-copy follow-up.
The shallow-copy comparisons used isolated loader experiments, including a generated-name reset.
After the actual helper edit, compilation, lint, 25 focused tests, and the modifier/schema-construction microbenchmarks were rerun.
The complete production-cost matrix was not rerun against that final helper with copying as the only variable.
Temporary measurement harnesses were removed; these numbers are investigation results, not a checked-in benchmark baseline.

## Proposed gate for resuming the update

1. Publish and select a TypeBox release containing the required fixes.
2. Verify customer bundle sizes in a clean consumer installation without our TypeBox dependency patch.
3. Prefer public optional and readonly APIs once they provide acceptable construction cost and a clear sharing contract.
4. Verify stable generated source and repeat the first-use and repeated-compilation measurements.
5. Repeat warm validation benchmarks, without coverage, against representative valid and invalid codec payloads.
6. Repeat the full matrix against the exact candidate code, with each optimization isolated before combining them.
7. Run codec correctness, persisted-format compatibility, refinement, and snapshot tests.
8. Rerun the coverage job and distinguish remaining harness variability from product regressions.
9. Record agreed performance and bundle-size budgets before accepting any remaining regression.

Restore prior performance where practical.
Any remaining tradeoff should be explicit, measured in absolute cost as well as ratios, and evaluated for customers rather than only this workspace.
