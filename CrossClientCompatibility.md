# Fluid Framework Cross-Client Compatibility

**Suggested pre-read:** The [Fluid Framework Compatibility Considerations](./FluidCompatibilityConsiderations.md) document provides an overview of Fluid's four compatibility dimensions: API compatibility, Layer compatibility, Cross-client compatibility, and Data-at-rest compatibility. This document focuses specifically on Cross-client compatibility — how clients running different versions of Fluid can collaborate on the same document.

## Overview

Cross-client compatibility is Fluid's ability to support collaboration between two clients running different versions of Fluid within an allowable window. This addresses two key scenarios:
1. **Rolling upgrades**: During version upgrades, there is an unavoidable transition window when clients running different versions must coexist and collaborate. This compatibility ensures users can continue working together seamlessly, whether or not their application instance has been updated yet.
2. **Multi-application ecosystems**: Different applications with different deployment schedules may host the same Fluid content. In such ecosystems, all applications integrating Fluid-based experiences must coordinate to respect the cross-client compatibility window. This avoids requiring all applications to be on exactly the same version, which would be impractical.

> **Note:** The cross-client compatibility guarantee applies to all Fluid layers (Driver, Loader, Runtime, and Datastore). However, the enforcement mechanisms described in this document — `minVersionForCollab`, feature gating, and client version checks — are currently implemented only at the **Runtime and Datastore layers**. The Driver layer does not currently have cross-client compatibility concerns because it does not exchange data formats between clients. Enforcement at the Loader layer may be added in the future. See the [Interaction with Layer Compatibility](./FluidCompatibilityConsiderations.md#interaction-with-layer-compatibility) section for more details.

This document explains:

- Which versions of Fluid can collaborate together
- How to configure cross-client compatibility
- Best practices for upgrading safely
- What to monitor in telemetry

### Terminology

| Term | Definition |
|------|------------|
| **N** | The most recent public major release of the Fluid Framework |
| **N-1** | The second most recent public major release |
| **N-2** | The third most recent public major release |
| **Saturation** | When an adequate percentage of an application's clients are running a certain version. The threshold that is considered adequate is defined by the application's requirements.  |

> **Note:** When referring to previous major releases (e.g., N-1), we assume the latest minor release within that major version series. All minor releases within a given major version are compatible with each other. However, please note this is currently TBD and is likely subject to change.

## Cross-Client Compatibility Policy

The Fluid Framework guarantees cross-client compatibility between adjacent major versions. This policy ensures that applications have sufficient time to upgrade while maintaining seamless collaboration.

| Version Combination | Compatibility |
|---------------------|---------------|
| **N / N-1** (adjacent major versions) | ✅ Fully compatible. No special action required. |
| **N / N-2 or older** | ❌ Not supported. These clients cannot collaborate. |

**Enforcement:** Incompatible clients will be blocked from collaborating on a document and shown a clear error message (see [Errors and Warnings to Monitor](#errors-and-warnings-to-monitor)).

**Example:** If the most recent public major release (N) is 4.0, a client running 4.x is cross-client compatible with 3.x clients, but not with 2.x or older clients.

## Understanding `minVersionForCollab`

`minVersionForCollab` is the primary mechanism for configuring cross-client compatibility. It is a container runtime load parameter (defined in [containerRuntime.ts](./packages/runtime/container-runtime/src/containerRuntime.ts)) that specifies the minimum Fluid version that is allowed to collaborate on a document. It serves two purposes:

1. **Feature gating**: It automatically enables or disables features based on the specified version to ensure all collaborating clients can understand the resulting data format. For example, if `minVersionForCollab` is set to `"2.0.0"`, features like grouped batching are safely enabled because all clients at version 2.0.0 or later can interpret that format.
2. **Client enforcement**: Clients running a Fluid version older than what the document requires will be blocked from joining the collaboration session, preventing data corruption or runtime errors. See [Errors and Warnings to Monitor](#errors-and-warnings-to-monitor) for the specific error signals.

If `minVersionForCollab` is not explicitly set, a default value is used. The default enables a conservative set of features that are safe for a broad range of clients. For details on the default value, see `defaultMinVersionForCollab` in [compatibilityBase.ts](./packages/runtime/runtime-utils/src/compatibilityBase.ts).

> **Note:** While `minVersionForCollab` currently operates at the container runtime layer, cross-client compatibility applies across all Fluid layers (Driver, Loader, Runtime, and Datastore). See the [Interaction with Layer Compatibility](./FluidCompatibilityConsiderations.md#interaction-with-layer-compatibility) section in the Fluid Compatibility Considerations document for more on how cross-client and layer compatibility interact.

## What This Means for An Application

As an application developer, you need to manage your Fluid version upgrades carefully to ensure uninterrupted collaboration for your users. By configuring `minVersionForCollab` appropriately and monitoring your client version distribution, you can safely upgrade while maintaining compatibility across your user base.

### Encapsulated vs Declarative Models

The cross-client compatibility policy applies to both application models. Both models use the same underlying enforcement and feature-gating mechanisms. They differ only in how you configure them, which is described in the sections below.

### Configuring Cross-Client Compatibility (Declarative Model)

If you are using a service client (i.e. `AzureClient` or `OdspClient`), cross-client compatibility is configured via the `CompatibilityMode` parameter. This is a required argument when creating or loading a container:

```typescript
// Creating a new container
const { container } = await azureClient.createContainer(schema, compatibilityMode);

// Loading an existing container
const { container } = await azureClient.getContainer(id, schema, compatibilityMode);
```

The client will map `CompatibilityMode` to a `minVersionForCollab` value (see [utils.ts](./packages/framework/fluid-static/src/utils.ts) for details) and automatically configure runtime options via [compatibilityConfiguration.ts](./packages/framework/fluid-static/src/compatibilityConfiguration.ts). This means you do not need to manage individual runtime options or version strings directly.

Below is the mapping of `CompatibilityMode` values to `minVersionForCollab` at the time of writing. For the most up-to-date mapping, please refer to `compatibilityModeToMinVersionForCollab` in [utils.ts](./packages/framework/fluid-static/src/utils.ts).

| Mode | Meaning | Mapped `minVersionForCollab` |
|------|---------|------------------------------|
| `"1"` | Supports collaboration with 1.x clients. Uses a conservative set of runtime options. | `"1.0.0"` |
| `"2"` | Supports collaboration with 2.x clients only. Enables newer features (e.g., runtime ID compressor for SharedTree support). | `"2.0.0"` |

### Configuring Cross-Client Compatibility (Encapsulated Model)

If you construct a container runtime directly, cross-client compatibility is configured by setting `minVersionForCollab` in the `LoadContainerRuntimeParams` passed into the `loadContainerRuntime` function:

```typescript
  const loadContainerRuntimeParams: LoadContainerRuntimeParams = {
    // Other props
    context,
    registryEntries,
    existing,
    requestHandler,
    runtimeOptions,
    containerScope,
    provideEntryPoint,
    // Configure cross-client compatibility by setting the minimum version
    minVersionForCollab: "2.0.0",
  };
  const runtime = await loadContainerRuntime(loadContainerRuntimeParams);
```

`minVersionForCollab` is a semver string representing the minimum Fluid version allowed to collaborate on a document. It automatically configures default values for runtime options to ensure compatibility with the specified version. For example, setting `minVersionForCollab` to `"2.0.0"` enables features like grouped batching that are safe for all 2.x clients.

You may also set individual runtime options via `IContainerRuntimeOptions`, but they must be consistent with your `minVersionForCollab` value. If there is a mismatch (e.g., enabling a 2.x feature with `minVersionForCollab: "1.0.0"`), a `UsageError` will be thrown (see [Errors and Warnings to Monitor](#errors-and-warnings-to-monitor)).

If `minVersionForCollab` is not explicitly set, a conservative default is used (see `defaultMinVersionForCollab` in [compatibilityBase.ts](./packages/runtime/runtime-utils/src/compatibilityBase.ts)).

We recommend maintaining `minVersionForCollab` at the latest version of Fluid that your users are [saturated](#terminology) on. This will ensure:
1. Older and newer clients can collaborate with each other safely.
2. Your application can leverage new Fluid features as soon as they become safe for cross-client collaboration.

### Best Practices

We recommend following the below pattern to ensure cross-client compatibility. While these steps are especially important when upgrading major versions of Fluid, keeping your compatibility configuration up-to-date on an ongoing basis ensures you are always within a safe compatibility window.

1. Observe the distribution of Fluid versions across your application's clients.
2. Update your compatibility configuration to match the lowest deployed version that your clients are [saturated](#terminology) on:
   - **Declarative model**: Set `CompatibilityMode` to the appropriate mode for that major version (e.g., `"2"` once clients are saturated on 2.x).
   - **Encapsulated model**: Set `minVersionForCollab` to the specific saturated version (e.g., `"2.10.0"`).
3. Verify that the configured compatibility is within the cross-client compatibility window of the Fluid version you want to upgrade to. If it is, bump your Fluid dependencies and no further action is required. If not, wait for further saturation and return to step 1.
4. Monitor telemetry for warnings/errors to ensure safe rollout (see [Errors and Warnings to Monitor](#errors-and-warnings-to-monitor) below). At this point any clients that are not saturated may be blocked from accessing the document.

### Errors and Warnings to Monitor

The following are errors and telemetry warnings you may see during and following an upgrade. Monitoring these signals will help ensure a safe rollout.

| Type | Signal | What it Means | What to Do |
|------|--------|---------------|------------|
| Telemetry Event | `MinVersionForCollabWarning` | Clients are joining with a version below your configured minimum, but are still able to understand the document's data format and therefore continue to collaborate. | If you see this warning message, it's likely a sign you updated `minVersionForCollab` too quickly. In future releases, ensure proper [saturation](#terminology) before updating. If these warning messages are ignored, you may risk seeing the below error in the future. |
| `DataProcessingError` | `Document can't be opened with current version of the code` | An out-of-window client tried to join and was blocked due to being unable to collaborate with the newer client's document. | If this was unexpected, lower `minVersionForCollab` to allow older clients to join. |
| `UsageError` | `Incompatible Runtime Option` | You manually enabled a feature that requires a higher minimum than your document allows. | Turn the feature off or raise `minVersionForCollab` (if there is proper [saturation](#terminology)). |

## Developer Guide

The developer guide that focuses on mechanics and internals for cross-client compatibility is described [here](./CrossClientCompatibilityDevGuide.md).
