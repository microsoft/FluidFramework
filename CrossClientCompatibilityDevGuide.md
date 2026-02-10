# Fluid Framework Cross-Client Compatibility Developer Guide

## Overview

This document describes the mechanics and internals of [Fluid Framework Cross-Client Compatibility](./CrossClientCompatibility.md) for **Fluid Framework contributors** — developers who maintain or extend the framework.

Cross-client compatibility ensures users on different Fluid Framework versions can collaborate safely. It protects against data corruption and runtime errors, giving customers the confidence to upgrade at their own pace. For developers, it provides a clear, structured path to ship new features without breaking existing experiences.

This guide covers:

- **Identifying Breaking Changes** - How to determine if a change affects cross-client compatibility
- **Enforcing the Policy** - How `minVersionForCollab`, default configurations, and unsafe configuration prevention work together
- **Safely Staging Breaking Changes** - Step-by-step process for shipping data-format changes
- **Testing** - How to validate cross-client compatibility using the e2e test infrastructure

### Terminology

| Term | Definition |
|------|------------|
| **N** | The most recent public major release of the Fluid Framework |
| **N-1** | The second most recent public major release |
| **N-2** | The third most recent public major release |

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

> **Note on `"2.0.0-defaults"`:** This is a special version string (considered less than `"2.0.0"` by `semver`) used as the default when a customer does not explicitly set `minVersionForCollab`. It exists to distinguish the unspecified case from an explicit `"2.0.0"` setting. Some options (e.g., `explicitSchemaControl`) use a threshold of `"2.0.0"` rather than `"2.0.0-defaults"`, meaning they only activate when the customer _explicitly_ sets `minVersionForCollab` to `"2.0.0"` or higher. See `defaultMinVersionForCollab` in [compatibilityBase.ts](./packages/runtime/runtime-utils/src/compatibilityBase.ts) more information.

### Unsafe Configuration Prevention

If a client tries to enable a runtime option that requires a version higher than the document's `minVersionForCollab`, the runtime will fail to instantiate and throw a `UsageError`. This is handled by the `runtimeOptionsAffectingDocSchemaConfigValidationMap` in [containerCompatibility.ts](./packages/runtime/container-runtime/src/containerCompatibility.ts).

**Example:** A container author sets `minVersionForCollab` to `"1.4.0"` and `enableGroupedBatching` to `true`. The runtime fails immediately stating that `minVersionForCollab` must be updated, since clients running runtime version 1.4.0 cannot understand the data format of grouped batching being enabled.

```typescript
// Simplified view of the validation map (see containerCompatibility.ts for full details)
const runtimeOptionsAffectingDocSchemaConfigValidationMap: ConfigValidationMap<RuntimeOptionsAffectingDocSchema> = {
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

### 1. Evaluate if a change breaks the cross-client compatibility policy

Determine whether a change breaks compatibility promises. Specifically, assess whether the data format has changed and whether older clients (within the defined compatibility window) have the necessary code to interpret the new format. If any clients within the collaboration window cannot interpret the new data format, proceed with the following steps.

Additionally, test your changes using the e2e test infrastructure to see if they break cross-client compatibility tests (see [Testing](#testing) below).

### 2. Add a container runtime option to enable/disable the change

Add a mechanism to enable/disable your change:

1. **Add a container runtime option** to `ContainerRuntimeOptionsInternal` in [containerRuntime.ts](./packages/runtime/container-runtime/src/containerRuntime.ts). The option should control whether your change is enabled or disabled. For example, there exists a runtime option for `createBlobPayloadPending` which determines whether to use the new or legacy behavior. New properties added to `ContainerRuntimeOptionsInternal` are automatically included in `RuntimeOptionsAffectingDocSchema` (defined in [containerCompatibility.ts](./packages/runtime/container-runtime/src/containerCompatibility.ts)) via an `Omit` pattern — this will cause a build failure until the configuration maps are updated in Step 3. If your option does **not** affect the document schema, explicitly add it to the `Omit` list in `RuntimeOptionsAffectingDocSchema`.

1. **Add a property** corresponding to the container runtime option to `IDocumentSchemaFeatures` in [documentSchema.ts](./packages/runtime/container-runtime/src/summary/documentSchema.ts).

1. **Update `documentSchemaSupportedConfigs`** to include the property added in step 2. It should be instantiated as one of the `IProperty` classes (e.g., `TrueOrUndefined`). Although unlikely, you may need to define a new class.

1. **Update the `desiredSchema.runtime` definition** to include your new property. Follow existing patterns in [documentSchema.ts](./packages/runtime/container-runtime/src/summary/documentSchema.ts) for reference.

1. **Ensure the container runtime option is passed** into the `DocumentsSchemaController` constructor when instantiating a new container runtime. Follow the existing patterns in [containerRuntime.ts](./packages/runtime/container-runtime/src/containerRuntime.ts) for reference.

### 3. Edit the "Configuration Maps" for this change

In [containerCompatibility.ts](./packages/runtime/container-runtime/src/containerCompatibility.ts), there are two configuration maps that must include an entry for each new runtime option. If an entry is missing, the build will fail to compile. This requirement ensures that all new runtime options are evaluated for their cross-client compatibility impact.

> **Note:** For options that do not affect the data format, they should be explicitly omitted from `RuntimeOptionsAffectingDocSchema` (see the code comments for guidance).

**First map: `runtimeOptionsAffectingDocSchemaConfigMap`** — Handles the [Default Configurations](#default-configurations) described above. Configure the entry corresponding to your runtime option as per the comments in the code. Each entry maps `MinimumVersionForCollab` values to the appropriate default value for that option.

**Second map: `runtimeOptionsAffectingDocSchemaConfigValidationMap`** — Handles [Unsafe Configuration Prevention](#unsafe-configuration-prevention) described above. Configure the entry corresponding to your runtime option as per the comments in the code. Each entry maps config values to the minimum `minVersionForCollab` required to use that value.

> The exact implementation of these configuration maps may change in the future. Refer to the code comments for the latest guidance as they should be the most up-to-date source of truth.

### 4. File an ADO item to remove the container runtime option

Since the policy's maximum compatibility promise is N/N-2, we will eventually not require a mechanism to disable certain features. However, some features (e.g., `enableRuntimeIdCompressor`) may never be enabled by default — in those cases, the enable/disable mechanism is kept indefinitely. Other features (e.g., `enableGroupedBatching`) are intended to eventually be a non-optional part of Fluid. If your change is the latter, file an ADO item to eventually remove the container runtime option entirely. This should be an ADO item because:

- It will likely be years before the policy allows removal of the mechanism.
- There is not currently a strong process/timeline for when this will be ready. More information will be added in the future when appropriate.

## Testing

Fluid's end-to-end test suite automatically generates cross-client compatibility variations using `describeCompat()` with `"FullCompat"`. The variations test cross-client compatibility scenarios by using one version of the Fluid runtime for creating containers and a different version for loading containers.

**Example:** A test may generate the following variations for cross-client compatibility scenarios:

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
