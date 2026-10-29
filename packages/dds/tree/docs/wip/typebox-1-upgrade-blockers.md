# TypeBox 1.4.2: branch review findings

## Current implementation

SharedTree and the CLI example declare `typebox` `^1.4.2`, with version **1.4.2** in the lockfile.
No TypeBox dependency patch is applied.
SharedTree uses TypeBox to construct serialized-data schemas and, when validation is enabled, to validate data against them.

| Area | Current behavior | Review evidence |
| --- | --- | --- |
| Optional and readonly modifiers | Callers use public `Type.Optional` and `Type.Readonly`; nested schemas are shared without mutating the input | [Builder tests](../../src/test/util/typebox.spec.ts) cover identity, metadata, refinements, frozen inputs, repeated and composed modifiers, and static types |
| Immutable schemas | TypeBox's `immutableTypes` setting recursively freezes nested schema containers | Builder tests cover property maps, required-key arrays, tuples, nested schemas, and mutation rejection |
| Compiler output | Repeated compilation produces identical generated code | [Compilation tests](../../src/test/codec/typeboxValidator.spec.ts) cover stable output and independent refinement bindings |
| Interface and record builders | Fluid retains specialized helpers to limit browser bundle size | [Helper implementations](../../src/util/typebox.ts), builder tests, and the bundle comparison below |
| Validator reuse | A `WeakMap` caches compiled validators by schema identity | [Validator implementation](../../src/external-utilities/typeboxValidator.ts) and tests for reuse, distinct identities, and compilation failures |
| Integer constraints | Integer-only fields use `Type.Integer`, including branded integer schemas | [Branded schema helper](../../src/util/typeboxBrand.ts) and [tests](../../src/test/util/typeboxBrand.spec.ts) cover bounds, near-integer rejection, and static brands |

### Sharing and caching contracts

The public modifiers share nested schema objects with their inputs.
Callers must treat shared schemas as immutable: a mutation can affect multiple composed schemas.
Builder tests exercise both `immutableTypes` and `enumerableKind` settings; this does not mean that SharedTree enables global immutable mode.

The compilation cache also requires schemas and compilation-affecting TypeBox settings to remain unchanged while cached validators are in use.
It does not detect schema mutation or provide structural deduplication for distinct schema objects.
Weak keys avoid retaining otherwise-unused schemas.

### Retained builder helpers

The [local helpers](../../src/util/typebox.ts) implement two restricted operations:

- `typeboxInterface` merges object properties and calls `Type.Object`, avoiding the general type-instantiation engine.
- `stringKeyRecord` creates a schema for arbitrary string keys through `Memory.Create`, avoiding the general record builder's template-literal parser.
  It preserves value-schema references into the enclosing schema.

These are not general replacements for TypeBox's interface and record APIs.
They depend on TypeBox's schema representation, and `stringKeyRecord` also depends on its metadata representation.
Tests cover object-property composition, inferred types, referenced record values, and recursive persisted-tree types.
The [lint configuration](../../eslint.config.mts) restricts calls to the general `Type.Interface` and `Type.Record` builders, but permits the public optional and readonly modifiers.

## Current performance measurements

Measurements used Node.js 22.22.3 on October 29, 2026.
They are local probes of the current implementation, not application-wide performance guarantees.
The measurement harnesses are not checked into the repository.

### Schema construction, compilation, and validation

The runtime probe used the sequence-field V3 changeset schema, a string node-change schema, and a valid payload containing 100 insertion marks.
Times are median microseconds per operation across seven batches after 1,000 warmups: 10,000 operations per batch, or 500 for compilation.

| Operation | Microseconds |
| --- | ---: |
| Construct a sequence-change schema | 6.89 |
| Compile the same sequence schema without Fluid's cache | 416 |
| Compile through Fluid's warm schema-identity cache | 0.024 |
| Validate 100 insertion marks | 15.69 |

Deterministic generated code does not make the cache redundant.
A warm cache hit avoids schema traversal, code generation, and validator evaluation.
The cache does not reduce the work performed by each validation call.
These measurements do not establish the cost of constructing a complete SharedTree or the effect of validation on connected workloads.

[SharedTree's default configuration](../../src/shared-tree/sharedTree.ts) uses `FormatValidatorNoOp`.
Schema construction therefore matters even when validation is disabled.
Consumers that select `FormatValidatorBasic` also incur compilation and validation costs; the [sandbox](../../src/sandboxing/common.ts) uses its own interpreted validator.

### Browser bundle size

Production Webpack 5.109.0 browser bundles exported `SharedTree` from the compiled package.
The configuration disabled caching and source maps, used serial Terser minification, omitted extracted license files, and used gzip level 9.
Each bundle was executed and checked for the `SharedTree.getFactory` export.

Both variants below use TypeBox 1.4.2.
The all-public variant replaced the interface/record helper module only for measurement; it is not the branch's implementation.

| Builder configuration | Minified bytes | Gzip bytes |
| --- | ---: | ---: |
| Current: public modifiers and local interface/record helpers | 453,446 | 123,403 |
| All public builders | 489,095 | 133,003 |

Replacing the remaining helpers adds **9,600 gzip bytes** to this bundle.
This supports retaining them until supported public APIs can provide comparable bundle size.
Executing the measurement variant and checking its export does not establish that the general builders preserve every helper behavior.
Any replacement must also pass the schema, static-type, reference, and persisted-format tests.

This comparison covers the default export bundle, not a fresh consumer installation or a validation-enabled customer bundle.
It does not isolate the contribution of the template-literal parser from its shared dependencies.

## Validation and input boundaries

Validation recorded for the current implementation:

- Tree and the CLI example compile.
- The targeted builder, validator, codec, sandbox, and persisted-snapshot suites passed **6,038 tests**, with **125 pending**.
- The CLI example's schema-compatibility test passed.
- Targeted lint and formatting checks passed.
- Persisted snapshots were unchanged; none were regenerated.

### In-memory input caveats

Direct probes of TypeBox 1.4.2's compiled validators confirm these behaviors:

| Schema and input | Result |
| --- | --- |
| Two-number tuple, `[1, 2]` with its length extended to 3, leaving a hole | Accepted |
| Two-number tuple, `[1, 2, 3]` | Rejected |
| `stringKeyRecord(Type.Number())`, `new Date(0)` | Accepted |
| `stringKeyRecord(Type.Number())`, `new Uint8Array([1, 2])` | Accepted |
| `Type.Integer()`, `1.00000000001` | Rejected |

Sparse arrays, dates, and typed arrays are not ordinary parsed JSON values.
These results nevertheless matter for APIs that pass in-memory values to validators.
They demonstrate validator behavior, not that every SharedTree input path accepts these values: callers can impose additional checks or normalize inputs.
The targeted tests do not establish equivalence for every JavaScript value, proxy, schema, or global setting.

## Review considerations

- Preserve the shared-schema and cache immutability contracts.
- Retain the interface/record helpers unless a replacement passes compatibility tests and avoids the measured bundle increase.
- Keep integer-only fields as integer schemas, preserving their bounds and static brands.
- Check the relevant input boundary before relying on JSON-schema validation to reject sparse arrays or non-JSON objects.
- Treat the local timing and bundle results as limited evidence.
  End-to-end initialization, browser runtime performance, validation-enabled customer bundles, and application-specific latency budgets require separate measurements.
- The targeted test results are not a full-suite, coverage, or CI-readiness result.
