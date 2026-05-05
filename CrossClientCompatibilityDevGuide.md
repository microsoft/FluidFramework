# Fluid Framework Cross-Client Compatibility Developer Guide

## Overview

This document describes the mechanics and internals of [Fluid Framework Cross-Client Compatibility](./CrossClientCompatibility.md) for **Fluid Framework contributors** — developers who maintain or extend the framework.

Cross-client compatibility ensures users on different Fluid Framework versions can collaborate safely. It protects against data corruption and runtime errors, giving customers the confidence to upgrade at their own pace. For developers, it provides a clear, structured path to ship new features without breaking existing experiences.

This guide covers:

- **Identifying Breaking Changes** - How to determine if a change affects cross-client compatibility
- **Enforcing the Policy** - How `minVersionForCollab`, default configurations, and unsafe configuration prevention work together
- **Safely Staging Breaking Changes** - Step-by-step process for shipping data-format changes
- **Cleaning Up Old Feature Gates** - When and how to remove feature gates that have aged out of the compatibility window
- **Designating a New Compatibility Checkpoint** - Checklist of updates required each time a new checkpoint is designated
- **Testing** - How to validate cross-client compatibility using the e2e test infrastructure

### Terminology

See the [Cross-Client Compatibility Policy](./CrossClientCompatibility.md#terminology)
for full terminology definitions. Key terms used in this guide:

<!-- prettier-ignore -->
| Term | Definition |
| --- | --- |
| **Compatibility Checkpoint Release** | The first Fluid release in a checkpoint range (e.g., `2.100.0` for CC-4). |
| **Compatibility Checkpoint Range** | The semver range of Fluid releases that are part of a checkpoint (e.g., `>=2.100.0 <2.130.0` for CC-4). All releases in the range share the same cross-client compatibility guarantees as the first release of the range. |
| **Compatibility Window** | The set of checkpoints guaranteed to be cross-client compatible (currently ~18 months in each direction, spanning Checkpoint N-3 through Checkpoint N+3). |

## Identifying Cross-Client Compatibility Breaking Changes

When evaluating whether a change is cross-client compatible, consider the relationship between code and data. Each client must be able to interpret the data it receives. If it cannot, this could lead to data corruption or runtime errors.

The following are examples of changes that could change the data format:

- Introducing a new op type
- Changing the format of an op (e.g., adding or removing a field)
- Changing the format of summaries
- Changing the data schema format (e.g., SharedTree)

However, there are many other types of changes that could impact cross-client compatibility. When unsure, assess whether the data format has changed and whether older clients (within the defined compatibility window) have the necessary code to interpret the new format.

## Cross-Client Compatibility Enforcement

If a change affects the data format (see above), it should be gated by a **container runtime option**. Runtime options are enforced via the `minVersionForCollab` property to ensure customers do not accidentally break older clients by enabling cross-client compatibility breaking features prematurely.

`minVersionForCollab` defines the minimum Fluid runtime version required for collaboration on a document. Customers are encouraged to set `minVersionForCollab` to the highest version their users are saturated on. If the customer does not set `minVersionForCollab`, a default value is assigned. `minVersionForCollab` controls the "default configurations" and "unsafe configuration prevention" mechanisms explained below.

### Default Configurations

The runtime uses `minVersionForCollab` to automatically set certain container runtime options. This is handled by the `runtimeOptionsAffectingDocSchemaConfigMap` in [containerCompatibility.ts](./packages/runtime/container-runtime/src/containerCompatibility.ts).

**Example:** If `minVersionForCollab` is set to `"2.0.0"`, then features such as grouped batching are safely enabled, since the lowest version we need to support collaboration with understands the associated data format changes. On the other hand, features such as `createBlobPayloadPending` remain disabled, as clients need to be running runtime version 2.40.0 or later to understand the associated data format changes.

```typescript
// Simplified view of the config map (see containerCompatibility.ts for full details)
const runtimeOptionsAffectingDocSchemaConfigMap: ConfigMap<RuntimeOptionsAffectingDocSchema> = {
	enableGroupedBatching: {
		"1.0.0": false,
		"2.0.0-defaults": true,
	},
	createBlobPayloadPending: {
		"1.0.0": undefined,
		// Could be enabled by default in a future version
	},
	// ... other options
};
```

> **Note on `"2.0.0-defaults"`:** This is a special version string (considered less than `"2.0.0"` by `semver`) used as the default when a customer does not explicitly set `minVersionForCollab`. It exists to distinguish the unspecified case from an explicit `"2.0.0"` setting. Some options (e.g., `explicitSchemaControl`) use a threshold of `"2.0.0"` rather than `"2.0.0-defaults"`, meaning they only activate when the customer _explicitly_ sets `minVersionForCollab` to `"2.0.0"` or higher. See `defaultMinVersionForCollab` in [compatibilityBase.ts](./packages/runtime/runtime-utils/src/compatibilityBase.ts) for more information.

### Unsafe Configuration Prevention

If a client tries to enable a runtime option that requires a version higher than the document's `minVersionForCollab`, the runtime will fail to instantiate and throw a `UsageError`. This is handled by the `runtimeOptionsAffectingDocSchemaConfigValidationMap` in [containerCompatibility.ts](./packages/runtime/container-runtime/src/containerCompatibility.ts).

**Example:** A container author sets `minVersionForCollab` to `"1.4.0"` and `enableGroupedBatching` to `true`. The runtime fails immediately stating that `minVersionForCollab` must be updated, since clients running runtime version 1.4.0 cannot understand the data format of grouped batching being enabled.

```typescript
// Simplified view of the validation map (see containerCompatibility.ts for full details)
const runtimeOptionsAffectingDocSchemaConfigValidationMap: ConfigValidationMap<RuntimeOptionsAffectingDocSchema> =
	{
		enableGroupedBatching: configValueToMinVersionForCollab([
			[false, "1.0.0"],
			[true, "2.0.0-defaults"],
		]),
		createBlobPayloadPending: configValueToMinVersionForCollab([
			[undefined, "1.0.0"],
			[true, "2.40.0"],
		]),
		// ... other options
	};
```

## Safely Staging Cross-Client Compatibility Breaking Changes

The following steps describe how to safely stage changes that break cross-client compatibility.

> **Note:** Cross-client breaking changes should aim to land in a
> **Compatibility Checkpoint Release** to maximize the compatibility window
> for clients in prior ranges.

### 1. Evaluate if a change breaks the cross-client compatibility policy

Determine whether a change breaks compatibility promises. Specifically, assess whether the data format has changed and whether older clients (within the defined compatibility window) have the necessary code to interpret the new format. The e2e test infrastructure (see [Testing](#testing) below) will surface many of these breaks automatically; run it as part of your evaluation. If any clients within the collaboration window cannot interpret the new data format, proceed with the following steps.

### 2. Add a container runtime option to enable/disable the change

Add a mechanism to enable/disable your change:

1. **Add a container runtime option** to `ContainerRuntimeOptionsInternal` in [containerRuntime.ts](./packages/runtime/container-runtime/src/containerRuntime.ts). The option should control whether your change is enabled or disabled. For example, there exists a runtime option for `createBlobPayloadPending` which determines whether to use the new or legacy behavior. New properties added to `ContainerRuntimeOptionsInternal` are automatically included in `RuntimeOptionsAffectingDocSchema` (defined in [containerCompatibility.ts](./packages/runtime/container-runtime/src/containerCompatibility.ts)) via an `Omit` pattern — this will cause a build failure until the configuration maps are updated in Step 3. The document schema is the enforcement mechanism for cross-client compatibility, so any breaking change must go through it. Do **not** add your option to the `Omit` list.

2. **Add a property** corresponding to the container runtime option to `IDocumentSchemaFeatures` in [documentSchema.ts](./packages/runtime/container-runtime/src/summary/documentSchema.ts).

3. **Update `documentSchemaSupportedConfigs`** to include the property added in the previous bullet. It should be instantiated as one of the `IProperty` classes (e.g., `TrueOrUndefined`). Although unlikely, you may need to define a new class.

4. **Update the `desiredSchema.runtime` definition** to include your new property. Follow existing patterns in [documentSchema.ts](./packages/runtime/container-runtime/src/summary/documentSchema.ts) for reference.

5. **Ensure the container runtime option is passed** into the `DocumentsSchemaController` constructor when instantiating a new container runtime. Follow the existing patterns in [containerRuntime.ts](./packages/runtime/container-runtime/src/containerRuntime.ts) for reference.

### 3. Edit the "Configuration Maps" for this change

In [containerCompatibility.ts](./packages/runtime/container-runtime/src/containerCompatibility.ts), there are two configuration maps that must include an entry for each new runtime option. If an entry is missing, the build will fail to compile. This requirement ensures that all new runtime options are evaluated for their cross-client compatibility impact.

> **Note:** The document schema is the enforcement mechanism for cross-client compatibility, so any
> breaking change must go through it. If you are following the steps in this section, your option must
> be configured in both maps below.

**First map: `runtimeOptionsAffectingDocSchemaConfigMap`** — Handles the [Default Configurations](#default-configurations) described above. Configure the entry corresponding to your runtime option as per the comments in the code. Each entry maps `MinimumVersionForCollab` values to the appropriate default value for that option.

**Second map: `runtimeOptionsAffectingDocSchemaConfigValidationMap`** — Handles [Unsafe Configuration Prevention](#unsafe-configuration-prevention) described above. Configure the entry corresponding to your runtime option as per the comments in the code. Each entry maps config values to the minimum `minVersionForCollab` required to use that value.

> The exact implementation of these configuration maps may change in the future. Refer to the code comments for the latest guidance as they should be the most up-to-date source of truth.

### 4. File a tracking item to remove the container runtime option

Because the compatibility window is time-bounded (currently 18 months), feature gates
will eventually age out of the window and can be removed. However, some features
(e.g., `enableRuntimeIdCompressor`) may never be enabled by default — in those cases,
the enable/disable mechanism is kept indefinitely. Other features
(e.g., `enableGroupedBatching`) are intended to eventually be a non-optional part of
Fluid. If your change is the latter, file an internal tracking item to eventually
remove the container runtime option entirely. See
[Cleaning Up Old Feature Gates](#cleaning-up-old-feature-gates) for when and how
removal becomes possible.

## Cleaning Up Old Feature Gates

Once a feature gate's minimum version threshold falls entirely outside the
compatibility window (i.e., all supported checkpoints are newer than the version
at which the feature was introduced), the gate can be removed and the feature can
become an unconditional part of Fluid.

The list of currently supported checkpoints is maintained on the
[Compatibility Checkpoints](./CompatibilityCheckpoints.md) page. Use that page to
determine the oldest supported checkpoint when evaluating whether a gate can be
removed.

### When can a feature gate be removed?

A feature gate can be removed when **all** of the following are true:

1. The feature's version threshold in `runtimeOptionsAffectingDocSchemaConfigMap`
   is older than or equal to the oldest supported compatibility checkpoint (see the
   [Compatibility Checkpoints](./CompatibilityCheckpoints.md) page).
2. No supported checkpoint release needs the ability to disable the feature.
3. The corresponding tracking item (filed in
   [Step 4](#4-file-a-tracking-item-to-remove-the-container-runtime-option)) has
   been approved for cleanup.

**Example:** Suppose `enableFoo` was introduced in version `2.95.0` and there are checkpoints
CC-4 (`"2.100.0"`), CC-5 (`"2.130.0"`), CC-6 (`"2.160.0"`), CC-7 (`"2.190.0"`), and CC-8 (`"2.220.0"`).

- **At CC-6** the compat window is CC-3 through CC-6, so CC-3 clients are still
  supported and the gate must remain. Some CC-3 clients (e.g., `2.90.0`) cannot understand the data format with `enableFoo` enabled, so the feature must remain gated.
- **At CC-7** the window shifts to CC-4 through CC-7. The oldest supported
  version (`2.100.0`) is above the `2.95.0` threshold, so every client in the
  window understands the feature. The gate can be removed once
  `lowestMinVersionForCollab` is `>= 2.95.0`. This becomes possible at the CC-7 designation.

### How to remove a feature gate

1. Remove the container runtime option from `ContainerRuntimeOptionsInternal`.
2. Remove the corresponding entries from `runtimeOptionsAffectingDocSchemaConfigMap`
   and `runtimeOptionsAffectingDocSchemaConfigValidationMap` in
   [containerCompatibility.ts](./packages/runtime/container-runtime/src/containerCompatibility.ts).
3. Hard-code the previously gated behavior as the unconditional default.
4. Update or remove any e2e tests that were specifically testing the
   enable/disable toggle for this feature.
5. Close the corresponding tracking item.

> **Note:** Features that are intentionally opt-in (e.g., `enableRuntimeIdCompressor`)
> should **not** be cleaned up — their gates are permanent.

## Designating a New Compatibility Checkpoint

Designation is the act of officially marking a Fluid Framework release as a new compatibility checkpoint. It does **not** by itself change runtime enforcement; the related runtime adjustments are described in [Tightening Runtime Enforcement](#tightening-runtime-enforcement) below.

A new checkpoint should be designated no less than 6 months after the previous one. It should also land on a new major or beta boundary (e.g., `3.0.0`, `2.100.0`), so the prior checkpoint's range can extend cleanly to the new boundary.

**To designate a new checkpoint:** update the [Compatibility Checkpoints](./CompatibilityCheckpoints.md) document and include a changeset noting the new boundary so it appears in the release notes.

## Tightening Runtime Enforcement

Once a checkpoint has aged out of the supported window, the runtime's compatibility thresholds can be advanced to drop support for it. There is no rule that we tighten enforcement in with each new checkpoint, and there is no rule against supporting compatibility for longer than 18 months. The cleanest cadence is to advance only when there is a concrete reason (e.g., a compat behavior we actually want to retire). See [Cleaning Up Old Feature Gates](#cleaning-up-old-feature-gates) for more details on retiring compat behaviors.

To tighten runtime enforcement:

1. **Advance `defaultMinVersionForCollab`:** Update the default in
   [compatibilityBase.ts](./packages/runtime/runtime-utils/src/compatibilityBase.ts)
   to the oldest checkpoint still in the supported window.
2. **Advance `lowestMinVersionForCollab`:** Update the floor in
   [compatibilityBase.ts](./packages/runtime/runtime-utils/src/compatibilityBase.ts)
   to match the oldest checkpoint still in the supported window.
   `lowestMinVersionForCollab` is the absolute minimum value a customer can
   pass as `minVersionForCollab` — values below it cause a `UsageError` at
   runtime. Include a changeset noting the raised minimum supported version,
   since this is a customer-visible breaking change. If
   `lowestMinVersionForCollab` advances across a major version boundary
   (e.g., `2.x` → `3.x`), also narrow the `MinimumVersionForCollab` type in
   [compatibilityDefinitions.ts](./packages/runtime/runtime-definitions/src/compatibilityDefinitions.ts)
   to drop the now-unsupported major from its definition.
3. **Update the e2e test matrix:** The `FullCompat` version matrix is derived
   from the currently supported checkpoints — update it so tests only run
   against versions within the new window.

## Testing

Fluid's end-to-end test suite automatically generates cross-client compatibility
variations using `describeCompat()` with `"FullCompat"`. The variations test
cross-client compatibility scenarios by using one version of the Fluid runtime for
creating containers and a different version for loading containers.

**Example:** A test may generate the following variations for cross-client
compatibility scenarios:

> **Note:** The version labels below (e.g., "N-1 fast train") reflect the current
> test infrastructure naming. These labels will be updated to reflect
> checkpoint-based versioning as part of the checkpoint adoption work.

```
compat cross-client - create with 2.43.0 (N) + load with 2.33.2 (N-1 fast train)
  ✔ Example test
compat cross-client - create with 2.43.0 (N) + load with 2.23.0 (N-2 fast train)
  ✔ Example test
compat cross-client - create with 2.43.0 (N) + load with 1.4.0 (N-1 slow train/LTS)
  ✔ Example test
compat cross-client - create with 2.33.2 (N-1 fast train) + load with 2.43.0 (N)
  ✔ Example test
compat cross-client - create with 2.23.0 (N-2 fast train) + load with 2.43.0 (N)
  ✔ Example test
compat cross-client - create with 1.4.0 (N-1 slow train/LTS) + load with 2.43.0 (N)
  ✔ Example test
```

To ensure your change is tested properly, write tests with multiple clients. If necessary, you can pass `minVersionForCollab` and container runtime options via `ITestContainerConfig` (defined in [testObjectProvider.ts](./packages/test/test-utils/src/testObjectProvider.ts)).

The `test-version-utils` package provides infrastructure for testing compatibility across different version combinations in CI/CD.

## References

### Core Implementation

- [containerCompatibility.ts](./packages/runtime/container-runtime/src/containerCompatibility.ts) — `RuntimeOptionsAffectingDocSchema` type, configuration maps (`runtimeOptionsAffectingDocSchemaConfigMap`, `runtimeOptionsAffectingDocSchemaConfigValidationMap`), and validation logic
- [containerRuntime.ts](./packages/runtime/container-runtime/src/containerRuntime.ts) — `minVersionForCollab` parameter and runtime initialization
- [documentSchema.ts](./packages/runtime/container-runtime/src/summary/documentSchema.ts) — `IDocumentSchemaFeatures` interface, `documentSchemaSupportedConfigs`, and `DocumentsSchemaController`
- [compatibilityBase.ts](./packages/runtime/runtime-utils/src/compatibilityBase.ts) — `ConfigMap`, `ConfigValidationMap`, and `getConfigsForMinVersionForCollab` utilities

### Testing

- [describeCompat.ts](./packages/test/test-version-utils/src/describeCompat.ts) — `describeCompat` function and `FullCompat` test generation
- [testObjectProvider.ts](./packages/test/test-utils/src/testObjectProvider.ts) — `ITestContainerConfig` interface for e2e test configuration
