# Fluid Framework Cross-Client Compatibility

**Suggested pre-read:** The [Fluid Framework Compatibility Considerations](./FluidCompatibilityConsiderations.md) document provides an overview of Fluid's four compatibility dimensions: API compatibility, Layer compatibility, Cross-client compatibility, and Data-at-rest compatibility. This document focuses specifically on Cross-client compatibility — how clients running different versions of the Fluid runtime can collaborate on the same document.

## Overview

Cross-client compatibility is Fluid's ability to support collaboration between two clients running different versions of the Fluid runtime within an allowable window. This addresses two key scenarios:
1. **Rolling upgrades**: During version upgrades, there is an unavoidable transition window when clients running different versions must coexist and collaborate. This compatibility ensures users can continue working together seamlessly, whether or not their application instance has been updated yet.
1. **Multi-application ecosystems**: Different applications with different deployment schedules may host the same Fluid content. In such ecosystems, all applications integrating Fluid-based experiences must coordinate to respect the cross-client compatibility window. This avoids requiring all applications to be on exactly the same version, which would be impractical.

This document explains:

- Which versions of the Fluid runtime can collaborate together
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

> **Note:** When referring to previous major releases (e.g., N-1), we assume the latest minor release within that major version series. All minor releases within a given major version are compatible with each other.

## Cross-Client Compatibility Policy

The Fluid Framework guarantees cross-client compatibility between adjacent major versions. This policy ensures that applications have sufficient time to upgrade while maintaining seamless collaboration.

| Version Combination | Compatibility |
|---------------------|---------------|
| **N / N-1** (adjacent major versions) | ✅ Fully compatible. No special action required. |
| **N / N-2 or older** | ❌ Not supported. These clients cannot collaborate. |

**Enforcement:** Incompatible clients will be blocked from collaborating on a document and shown a clear error message.

**Example:** If the most recent public major release (N) is 4.0, a client running 4.x is cross-client compatible with 3.x clients by default, but not with 2.x or older clients.

## What This Means for An Application

As an application developer, you need to manage your Fluid version upgrades carefully to ensure uninterrupted collaboration for your users. By configuring `minVersionForCollab` appropriately and monitoring your client version distribution, you can safely upgrade while maintaining compatibility across your user base.

### Configuring Cross-Client Compatibility

For the best results, we encourage you to set the `minVersionForCollab` property (defined in [containerRuntime.ts](./packages/runtime/container-runtime/src/containerRuntime.ts)). `minVersionForCollab` represents the minimum Fluid runtime version allowed to collaborate in a document. It will automatically disable any features that prevent safe cross-client collaboration for clients that are at least the version specified.

For example, if you want to ensure collaboration between N/N-1 clients, the proper configuration for `minVersionForCollab` would be the latest minor release corresponding to the N-1 major version series.

We recommend maintaining `minVersionForCollab` at the latest version of Fluid that your users are saturated on. This will ensure:
1. Older and newer clients can collaborate with each other safely.
1. Your application can leverage new Fluid features as soon as they become safe for cross-client collaboration.

### Best Practices

We recommend following the below pattern to ensure cross-client compatibility when upgrading major versions of Fluid.

1. Observe the distribution of Fluid versions across your application's clients.
1. Set `minVersionForCollab` to the lowest deployed version that the application's clients are saturated on.
1. If `minVersionForCollab` is within the cross-client compatibility window of the Fluid version you want to upgrade then bump Fluid dependencies and no further action is required. If `minVersionForCollab` is not within the cross-client compatibility window, then wait for further saturation and return to step 1.
1. Monitor telemetry for warnings/errors to ensure safe rollout (see below section). At this point any clients that are not saturated may be blocked from accessing the document.

### Errors and Warnings to Monitor

The following are errors and telemetry warnings you may see during and following an upgrade. Monitoring these signals will help ensure a safe rollout.

| Signal | What it Means | What to Do |
|--------|---------------|------------|
| Telemetry Event: `MinVersionForCollabWarning` | Clients are joining with a version below your configured minimum, but are still able to understand the document's data format and therefore continue to collaborate. | If you see this warning message, it's likely a sign you updated `minVersionForCollab` too quickly. In future releases, ensure proper saturation before updating. If these warning messages are ignored, you may risk seeing the below error in the future. |
| `DataProcessingError`: Document can't be opened with current version of the code | An out-of-window client tried to join and was blocked due to being unable to collaborate with the newer client's document. | If this was unexpected, lower `minVersionForCollab` to allow older clients to join. |
| `UsageError`: Incompatible Runtime Option | You manually enabled a feature that requires a higher minimum than your document allows. | Turn the feature off or raise `minVersionForCollab` (if there is proper saturation). |

## Developer Guide

The developer guide that focuses on mechanics and internals for cross-client compatibility is described [here](./CrossClientCompatibilityDevGuide.md).
