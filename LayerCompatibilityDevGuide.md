# Fluid Framework Layer Compatibility Developer Guide

## Overview

This document describes the mechanics and internals of [Fluid Framework Layer Compatibility](./LayerCompatibility.md) for **Fluid Framework contributors** — developers who maintain or extend the framework.

This guide covers:

- **Layer Compatibility Mechanics** — How generation numbers, features, and validation logic work together to enforce compatibility
- **Key Implementation Details** — How to add new features, update generation numbers, and test compatibility
- **References** — Links to the source files that implement the compatibility system

## Layer Compatibility Mechanics

### Generation Numbers

Each layer maintains a **generation number** that increments on a regular cadence (typically monthly). Generation numbers enable time-based compatibility:

- Each layer specifies a `minSupportedGeneration` for adjacent layers
- If an adjacent layer's generation is below the minimum, validation fails
- This creates a sliding compatibility window (e.g., 6 months = 6 generations)

**Examples:**

Consider the following examples across the Loader ↔ Runtime boundary:

```typescript
// Loader layer's compatibility details
export const loaderCompatDetailsForRuntime: ILayerCompatDetails = {
    generation: 10, // Current generation number
    packageVersion: "2.5.0",
    supportedFeatures: new Set<string>([]),
};
```

**Example 1:** Loader is compatible with the Runtime:
```typescript
// Runtime layer's requirements for Loader
export const loaderSupportRequirementsForRuntime: ILayerCompatSupportRequirements = {
    minSupportedGeneration: 5, // Loader must be at least generation 5
    requiredFeatures: [],
};
```
- Layers are compatible because Runtime requires Loader to be at least generation 5 and Loader is generation 10.

**Example 2:** Loader is incompatible with the Runtime:
```typescript
// Runtime layer's requirements for Loader
export const loaderSupportRequirementsForRuntime: ILayerCompatSupportRequirements = {
    minSupportedGeneration: 11, // Loader must be at least generation 11
    requiredFeatures: [],
};
```
- Layers are incompatible because Runtime requires Loader to be at least generation 11 and Loader is generation 10.

### Features

Layers can declare **supported features** and **required features**. Features serve two key purposes:

1. **Validation:** Ensuring adjacent layers have required capabilities before allowing them to interact
2. **Feature Staging:** Allowing developers to introduce and use new capabilities gradually without waiting for full saturation across the compatibility window

- **Supported Features:** Features or capabilities a layer provides which another layer may require
- **Required Features:** Features or capabilities the adjacent layer must support

**Validation Scenarios:**

**Scenario 1: Compatible** - Layer A supports a feature, Layer B optionally uses it:
```typescript
layerADetails.supportedFeatures = new Set(["foo"]);
layerBRequirements.requiredFeatures = []; // Foo is not required yet
// Result: Compatible. Layer B can conditionally check and use "foo" if available
```

**Scenario 2: Incompatible** - Layer B requires a feature, Layer A doesn't support it:
```typescript
layerADetails.supportedFeatures = new Set([]); // foo not supported
layerBRequirements.requiredFeatures = ["foo"]; // Required
// Result: Incompatible. Validation fails because foo is missing
```

See the [Adding a New Feature](#adding-a-new-feature) section for a complete implementation example.

### Package Versions

Each layer includes its package version in compatibility details. While not used for validation logic, package versions are included in error telemetry to help diagnose incompatibility issues.

### Validation Logic

The core validation function is `checkLayerCompatibility` in [layerCompat.ts](./packages/common/client-utils/src/layerCompat.ts):

```typescript
export function checkLayerCompatibility(
	compatSupportRequirementsLayer1: ILayerCompatSupportRequirements,
	compatDetailsLayer2: ILayerCompatDetails | undefined,
): LayerCompatCheckResult;
```

**Validation Steps:**

1. Check generation compatibility: `layer2.generation >= layer1.minSupportedGeneration`
2. Check feature compatibility: All features in `layer1.requiredFeatures` must be in `layer2.supportedFeatures`
3. Return result indicating compatibility or specific incompatibility reasons

### Bypass Configuration

For testing, layer validation can be bypassed using the configuration flag:

```typescript
// In config provider
configProvider.set("Fluid.AllowIncompatibleLayers", true);
```

This will log a warning event but allow incompatible layers to work together. **Use with caution** - this should only be used in controlled scenarios.

## Key Implementation Details

### Adding a New Feature

To add a new feature that requires compatibility validation:

1. **Add to supported features** in the layer providing the feature. Add a comment about which generation the feature is added.
2. **Add logic to conditionally use feature** in the layer that needs the feature. Basically, if the other layer supports the feature, use it, else don't.
3. **Add to required features** in the layer requiring the feature after it has been in supported features for longer than the supported compatibility window for that layer boundary. Basically, once the generation of the layer is greater than the generation feature was added + compatibility window (in months).
> Note: It may seem unnecessary and redundant to move the feature to the required features list because generation validation will fail if the layers are incompatible. However, this is done for two purposes:
> 1. The generation based validation may not be supported long term. We may switch to throwing a warning if generations are incompatible but not fail if there aren't any unsupported features to support maximum compatibility for applications.
> 2. Having required features will give us telemetry data on how often compatibility fails because of feature incompatibility (and which features) vs layers being out of the compat window. This will help drive the decision for # 1.

**Example**:

Consider adding a new feature "foo" to the Loader ↔ Runtime boundary where say the supported compatibility window is 12 months.

1. Add "foo" to Loader's supported features for Runtime.
    ```typescript
    // Loader adds support for the new feature
    export const loaderCompatDetailsForRuntime: ILayerCompatDetails = {
        generation: 1,
        packageVersion: "2.5.0",
        supportedFeatures: new Set<string>([
            "foo", // foo added in generation 10
        ]),
    };
    ```

2. Runtime doesn't require "foo" but uses it conditionally.
    ```typescript
    // Runtime doesn't require the feature
    export const runtimeSupportRequirementsForLoader: ILayerCompatSupportRequirements = {
        minSupportedGeneration: 1,
        requiredFeatures: [], // foo not required yet
    };

    // In Runtime code - conditional usage of the feature
    class MyRuntime {
        private useFoo: boolean;

        // container context is part of the Loader layer.
        constructor(private containerContext: IContainerContext) {
            // Check if Loader supports the new feature
            const loaderCompat = containerContext.getLayerCompatDetails();
            this.useFoo = loaderCompat?.supportedFeatures.has("foo") ?? false;
        }

        bar() {
            if (this.useFoo) {
                // Use the new foo feature
                this.containerContext.foo();
            } else {
                // Fall back to default behavior
            }
        }
    }
    ```
3. Update Runtime to require "foo" once its generation is 13 - "foo" was added in generation 1 and the support window is 12 months.
    ```typescript
    // Runtime's generation is 13.
    export const runtimeCompatDetails: ILayerCompatDetails = {
        generation: 13,
        packageVersion: "2.28.0",
        supportedFeatures: new Set<string>([]),
    };

    // Runtime requires the feature
    export const runtimeSupportRequirementsForLoader: ILayerCompatSupportRequirements = {
        minSupportedGeneration: 10,
        requiredFeatures: ["foo"], // foo is now required
    };
    ```

When Runtime initializes, the compatibility validation with Loader will now fail.


### Bumping Generation Numbers

Generation numbers are updated on a regular cadence (monthly) coordinated across the codebase. This happens automatically during minor / major releases if the following criteria is met:
- At least a month has passed since the last update to the generation.
- Between releases, increment generation by at most `(narrowest compat window - 1)`. For example, if the narrowest compat window across all layer boundaries is 3 months, increment by at most 2 generations. This ensures customers have time to upgrade packages before layer compatibility breaks.

**Example of violating this rule:**

Suppose 5 months pass between releases and the Runtime ↔ DataStore compat window is **3 months**:

- An Application is on package version 1 of Fluid where Runtime and DataStore are generation 1. They are compatible.
- 5 months later, Fluid releases package version 2. If we increment generation by 5, Runtime and DataStore will both be at generation 6.
- The application upgrades the Runtime to version 2 but doesn't upgrade DataStore just yet.
- **Result:** Layer compatibility breaks immediately because Runtime at generation 6 requires DataStore to be at least generation 3 (6 - 3 month compat window). This prevents customers from upgrading these layers independently - upgrading Runtime alone immediately breaks compatibility.

By limiting increments to 2 (compat window - 1), customers have time to upgrade Runtime, then upgrade DataStore before the compatibility window closes.

### Testing Compatibility

The test suite in [layerCompat.spec.ts](./packages/test/test-end-to-end-tests/src/test/layerCompat.spec.ts) validates all layer combinations:

- Tests both create and load flows
- Tests generation incompatibility
- Tests feature incompatibility
- Tests bypass configuration

The `test-version-utils` package provides infrastructure for testing compatibility across different version combinations in CI/CD.

## References

### Core Type Definitions

- [layerCompat.ts](./packages/common/client-utils/src/layerCompat.ts) - Core types, validation logic, and the `FluidLayer` type definition

### Layer Compatibility State

- [loaderLayerCompatState.ts](./packages/loader/container-loader/src/loaderLayerCompatState.ts) - Loader compat details
- [runtimeLayerCompatState.ts](./packages/runtime/container-runtime/src/runtimeLayerCompatState.ts) - Runtime compat details
- [dataStoreLayerCompatState.ts](./packages/runtime/datastore/src/dataStoreLayerCompatState.ts) - DataStore compat details
- [localLayerCompatState.ts](./packages/drivers/local-driver/src/localLayerCompatState.ts) - Local Driver compat details
- [odspLayerCompatState.ts](./packages/drivers/odsp-driver/src/odspLayerCompatState.ts) - ODSP Driver compat details
- [r11sLayerCompatState.ts](./packages/drivers/routerlicious-driver/src/r11sLayerCompatState.ts) - Routerlicious / AFR driver compat details

### Testing

- [layerCompat.spec.ts](./packages/test/test-end-to-end-tests/src/test/layerCompat.spec.ts) - Compatibility test suite
- [layerCompatError.ts](./packages/utils/telemetry-utils/src/layerCompatError.ts) - Error handling and telemetry
