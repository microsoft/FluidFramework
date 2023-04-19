---
title: Experimental Features
aliases:
  - "/docs/build/experimental-features/"
author: scottn12
---

## Overview

At any given time, there are experimental features within FluidFramework that are being actively developed/tested. In order to allow developers to adopt and test these features in a controlled environment, we introduced feature gates. Feature gates are user defined values that allow experimental features to be easily enabled, and disabled if they cause unexpected behavior. This document will provide details on how to use feature gates to enable experimental features.

{{<callout warning>}}

Experimental features are by definition not fully supported and **should not be used in production applications**. Moreover, experimental features may be **added, modified, or removed without warning** in any minor or major release.

{{< /callout >}}

## API

To enable experimental features, you will be required to provide an implementation of `IConfigProviderBase`. Please note the following about `IConfigProviderBase`:

-   `IConfigProviderBase` will accept input of a map-like object. The keys must be type `string` with the exact names of the features you want to enable. The values must be of type `ConfigType`, which is defined as a union of primitive types and arrays of primitive types.
-   All experimental features will default to a disabled/neutral state.

### Observability

When a [container]({{< relref "containers.md" >}}) is loaded, there will be several events logged to the provided logger. One of these events is `"fluid:telemetry:ContainerLoadStats"`. Within this event, there is a property `"featureGates"`, which will contain each of the experimental features (and the corresponding `ConfigType` values) that the container was loaded with.

## Usage

The following is an example of how to enable experimental features with `AzureClient`.

1. First, implement [IConfigProviderBase]({{< relref "docs/apis/telemetry-utils/iconfigproviderbase-interface" >}}). For example:

    ```typescript
    const configProvider = (settings: Record<string, ConfigTypes>): IConfigProviderBase => ({
      getRawConfig: (name: string): ConfigTypes => settings[name]
    });
    ```

2. Next, define the experimental features you want to enable. You will need to know the exact `string` name of the feature and any corresponding `ConfigType` values. As mentioned above, `ConfigType` only supports primitive types and arrays of primitive types.

    ```typescript
    const featureGates = {
      "Fluid.ContainerRuntime.ExampleFeature1": true,
      "Fluid.ContainerRuntime.ExampleFeature2": ["exampleConfig1", "exampleConfig2"],
    };
    ```

3. Finally, call the previously defined `configProvider` function with `featureGates` as the input, and pass the result in the `AzureClient` constructor.

    ```typescript
    const azureClient = new AzureClient({ 
      connection: connectionProps, 
      logger: myLogger, 
      configProvider: configProvider(featureGates),
    });
    ```
