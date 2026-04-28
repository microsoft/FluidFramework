# Fluid Framework Cross-Client Compatibility

**Suggested pre-read:** The [Fluid Framework Compatibility Considerations](./FluidCompatibilityConsiderations.md) document provides an overview of Fluid's four compatibility dimensions: API compatibility, Layer compatibility, Cross-client compatibility, and Data-at-rest compatibility. This document focuses specifically on Cross-client compatibility — how clients running different versions of Fluid can collaborate on the same document.

## Overview

Cross-client compatibility is Fluid's ability to support collaboration between two clients running different versions of Fluid within an allowable window. This addresses two key scenarios:

1. **Rolling upgrades**: During version upgrades, there is an unavoidable transition window when clients running different versions must coexist and collaborate. This compatibility ensures users can continue working together seamlessly, whether or not their application instance has been updated yet.
2. **Multi-application ecosystems**: Different applications with different deployment schedules may host the same Fluid content. In such ecosystems, all applications integrating Fluid-based experiences must coordinate to respect the cross-client compatibility window. This avoids requiring all applications to be on exactly the same version, which would be impractical.

> **Note:** The cross-client compatibility guarantee applies to all Fluid layers (Driver, Loader, Runtime, and
> Datastore). However, the enforcement mechanisms described in this document — `minVersionForCollab`, feature
> gating, and client version checks — are currently implemented only at the **Runtime and Datastore layers**.
> The Driver layer does not currently have cross-client compatibility concerns because it does not exchange data
> formats between clients. Enforcement at the Loader layer may be added in the future. See the
> [Interaction with Layer Compatibility](./FluidCompatibilityConsiderations.md#interaction-with-layer-compatibility)
> section for more details. How these mechanisms are configured depends on your application model — see
> [Encapsulated vs Declarative Models](#encapsulated-vs-declarative-models) below.

This document explains:

- Which versions of Fluid can collaborate together
- How to configure cross-client compatibility
- Best practices for upgrading safely
- What to monitor in telemetry

### Terminology

<!-- prettier-ignore -->
| Term | Definition |
| --- | --- |
| **Compatibility Checkpoint Release** | The first Fluid release in a checkpoint range (e.g., `2.100.0` for CC-4). |
| **Compatibility Checkpoint Range** | The semver range of Fluid releases that are part of a checkpoint (e.g., `>=2.100.0 <2.130.0` for CC-4). All releases in the range share the same cross-client compatibility guarantees as the first release of the range. |
| **Checkpoint N** | `CC-N`; any individual compatibility checkpoint range. `Checkpoint N-1` `CC-(N-1)`, the compatibility checkpoint range before `N`, and so on for `N-2`, `N-3`, etc. |
| **Saturation** | When an adequate percentage of an application's clients are running a certain version. The specific percentage is defined by the application's requirements (not by Fluid Framework). |

## Cross-Client Compatibility Policy

The Fluid Framework guarantees cross-client compatibility within an **18-month window**, enforced through
designated **compatibility checkpoints**. A new Compatibility Checkpoint Release is published on a
**6-month cadence** and each checkpoint's Range spans until the next Compatibility Checkpoint Release.
Checkpoints are identified in the [Compatibility Checkpoints](./CompatibilityCheckpoints.md) page.
Any two clients are compatible as long as their checkpoints are within ~18 months of each other.
The window extends in both directions from any checkpoint `N`, spanning Checkpoint `N-3` through
Checkpoint `N+3`. Because a Range extends for ~6 months after the opening Release, the effective
compatibility window for a client toward the end of a Range can be up to ~24 months.

> **Note:**
> This policy is decoupled from major version boundaries. A new Fluid major
> version (e.g., `3.0`, `4.0`) does not automatically drop cross-client
> compatibility with prior majors — any cross-client breaking change
> introduced by a major version must still adhere to the 18-month window.

**Enforcement:** Incompatible clients will be blocked from collaborating on a document and shown a clear error message (see [Errors and Warnings to Monitor](#errors-and-warnings-to-monitor)).

### Examples

<!-- prettier-ignore -->
| Version Combination | Time Between Checkpoints | Compatibility |
| --- | --- | --- |
| **Checkpoint N / Checkpoint N±1** | ~6 months | ✅ Compatible |
| **Checkpoint N / Checkpoint N±2** | ~12 months | ✅ Compatible |
| **Checkpoint N / Checkpoint N±3** | ~18 months | ✅ Compatible |
| **Checkpoint N / Checkpoint N±4 or beyond** | >18 months | ❌ Not supported |

> **Note on non-checkpoint versions:** Customers are not required to run checkpoint
> releases. A client on a non-checkpoint version inherits the compatibility guarantees
> of the nearest checkpoint at or below its version.
>
> For example, let's say
> checkpoints were designated at `2.100.0` and `2.200.0`. A client on version
> `2.150.0` would inherit `2.100.0`'s compatibility window.

## Cross-client Compatibility Configuration and Enforcement

### minVersionForCollab

`minVersionForCollab` is the primary mechanism for configuring cross-client compatibility. It is a container runtime load parameter (defined in [containerRuntime.ts](./packages/runtime/container-runtime/src/containerRuntime.ts)) that specifies the minimum Fluid version that is allowed to collaborate on a document. It serves two purposes:

1. **Cross-client compatibility enforcement**: Clients running a Fluid version older than what the document requires will be blocked from joining the collaboration session, preventing data corruption or runtime errors. See [Errors and Warnings to Monitor](#errors-and-warnings-to-monitor) for the specific error signals.
2. **Feature gating**: It automatically enables or disables features based on the specified version to ensure all collaborating clients can understand the resulting data format. For example, if `minVersionForCollab` is set to `"2.0.0"`, features like grouped batching are safely enabled because all clients at version 2.0.0 or later can interpret that format.

If `minVersionForCollab` is not explicitly set, the runtime uses a default derived from the currently supported compatibility checkpoints. Passing a value below the supported floor is not permitted — the runtime will fail to instantiate and throw a `UsageError` (see [Errors and Warnings to Monitor](#errors-and-warnings-to-monitor)). For details on the default value, see `defaultMinVersionForCollab` in [compatibilityBase.ts](./packages/runtime/runtime-utils/src/compatibilityBase.ts).

### What This Means for an Application

As an application developer, you need to manage your Fluid Framework version upgrades carefully to ensure uninterrupted collaboration for your users. It is **highly recommended** to explicitly configure `minVersionForCollab` and monitor your client version distribution. Setting `minVersionForCollab` explicitly surfaces version mismatches at build and verification time. This prevents a release from shipping and silently raising the floor, locking older clients out.

#### Encapsulated vs Declarative Models

The cross-client compatibility policy applies to both application models. Both models use the same underlying enforcement and feature-gating mechanisms. They differ only in how you configure them, which is described in the sections below.

For more information on the differences between these models, see [Application Models](./ApplicationModels.md).

##### Scope by Layer

The 18-month policy above applies uniformly to every Fluid layer that
participates in cross-client communication (Loader, Runtime, Datastore / DDSes).
The Driver layer is the only exception — it has no cross-client interactions,
so any driver version is considered cross-client compatible with any other.

This uniformity holds in both the declarative and encapsulated models; mixing
versions across layers within a single client does not extend the cross-client
window. Fluid handles the interaction between cross-client compat and layer
compat internally (see
[Interaction with Layer Compatibility](./FluidCompatibilityConsiderations.md#interaction-with-layer-compatibility)).

#### Configuring Cross-Client Compatibility (Declarative Model)

If you are using a service client (i.e. `AzureClient` or `OdspClient`), cross-client compatibility is configured via the `CompatibilityMode` parameter. This is a required argument when creating or loading a container:

```typescript
// Creating a new container
const { container } = await azureClient.createContainer(schema, compatibilityMode);

// Loading an existing container
const { container } = await azureClient.getContainer(id, schema, compatibilityMode);
```

The client will map `CompatibilityMode` to a `minVersionForCollab` value (see [utils.ts](./packages/framework/fluid-static/src/utils.ts) for details) and automatically configure runtime options via [compatibilityConfiguration.ts](./packages/framework/fluid-static/src/compatibilityConfiguration.ts). This means you do not need to manage individual runtime options or version strings directly.

Below is the mapping of `CompatibilityMode` values to `minVersionForCollab` at the time of writing. For the most up-to-date mapping, please refer to `compatibilityModeToMinVersionForCollab` in [utils.ts](./packages/framework/fluid-static/src/utils.ts).

<!-- prettier-ignore -->
| Mode | Meaning | Mapped `minVersionForCollab` |
| --- | --- | --- |
| `"1"` | Supports collaboration with 1.x clients. Uses a conservative set of runtime options. | `"1.0.0"` |
| `"2"` | Supports collaboration with 2.x clients only. Enables newer features (e.g., runtime ID compressor for SharedTree support). | `"2.0.0"` |

#### Configuring Cross-Client Compatibility (Encapsulated Model)

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

If `minVersionForCollab` is not explicitly set, the runtime uses a default derived from the currently supported compatibility checkpoints (see `defaultMinVersionForCollab` in [compatibilityBase.ts](./packages/runtime/runtime-utils/src/compatibilityBase.ts)). Passing a value below the supported floor is not permitted and will throw a `UsageError`.

Setting `minVersionForCollab` explicitly is **highly recommended**. Set it to the oldest Fluid Framework
version your users are [saturated](#terminology) on. This will ensure:

1. Older and newer clients can collaborate with each other safely.
2. Your application can leverage new Fluid Framework features as soon as they become safe for cross-client collaboration.

#### Best Practices

We recommend following the below pattern to ensure cross-client compatibility. Keeping your compatibility configuration up-to-date on an ongoing basis ensures you are always within a safe compatibility window.

1. Observe the distribution of Fluid versions across your application's clients. See [Observing Client Version Distribution](./FluidCompatibilityConsiderations.md#observing-client-version-distribution) for how to do this using telemetry.
2. Update your compatibility configuration to match the oldest deployed version that your clients are [saturated](#terminology) on:
    - **Declarative model**: Set `CompatibilityMode` to the value corresponding to that saturated version.
    - **Encapsulated model**: Set `minVersionForCollab` to the specific saturated version (e.g., `"2.10.0"`).
3. Verify that the configured compatibility checkpoint is within the supported compatibility window of the Fluid Framework version you want to upgrade to. If it is, bump your Fluid Framework dependencies and update your lock file (so a newer version isn't picked up implicitly); no further action is required. If not, wait for further saturation and return to step 1.
4. Monitor telemetry for warnings/errors to ensure safe rollout (see [Errors and Warnings to Monitor](#errors-and-warnings-to-monitor) below). At this point any clients running a version older than the configured `minVersionForCollab` may be blocked from accessing the document.

#### Errors and Warnings to Monitor

The following are errors and telemetry warnings you may see during and following an upgrade. Monitoring these signals will help ensure a safe rollout. For more details on telemetry, see [Logging and telemetry](https://fluidframework.com/docs/testing/telemetry) and [Observing Client Version Distribution](./FluidCompatibilityConsiderations.md#observing-client-version-distribution).

<!-- prettier-ignore -->
| Type | Signal | What it Means | What to Do |
| --- | --- | --- | --- |
| Telemetry Event | `MinVersionForCollabWarning` | Clients are joining with a version below your configured minimum, but are still able to understand the document's data format and therefore continue to collaborate. | If you see this warning message, it's likely a sign you updated `minVersionForCollab` too quickly. In future releases, ensure proper [saturation](#terminology) before updating. If these warning messages are ignored, you may risk seeing the below error in the future. |
| `DataProcessingError` | `Document can't be opened with current version of the code` | An out-of-window client tried to join and was blocked due to being unable to collaborate with the newer client's document. | If this was unexpected, lower `minVersionForCollab` so newly-created documents will admit older clients. **Note:** documents whose schema has already been elevated by a higher-`minVersionForCollab` writer may continue to block older clients on those specific documents — lowering the configured value does not retroactively undo the elevation in the document's persisted schema. |
| `UsageError` | `Incompatible Runtime Option` | You manually enabled a feature that requires a higher minimum than your document allows. | Turn the feature off or raise `minVersionForCollab` (if there is proper [saturation](#terminology)). |
| `UsageError` | `Runtime option <name>:<value> requires runtime version <X>` | You manually enabled a feature that requires a higher minimum than your document allows. | Turn the feature off or raise `minVersionForCollab` (if there is proper [saturation](#terminology)). |

## Developer Guide

The developer guide that focuses on mechanics and internals for cross-client compatibility is described [here](./CrossClientCompatibilityDevGuide.md).
