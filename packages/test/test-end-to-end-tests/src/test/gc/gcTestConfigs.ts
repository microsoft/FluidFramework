/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ConfigTypes, IConfigProviderBase } from "@fluidframework/telemetry-utils";
import { ITestContainerConfig } from "@fluidframework/test-utils";

export const mockConfigProvider = ((settings: Record<string, ConfigTypes> = {}): IConfigProviderBase => {
    settings["Fluid.ContainerRuntime.UseDataStoreAliasing"] = "true";
    settings["Fluid.GarbageCollection.TrackGCState"] = "true";
    settings["Fluid.GarbageCollection.WriteDataAtRoot"] = "true";
    return {
        getRawConfig: (name: string): ConfigTypes => settings[name],
    };
});

/**
 * Default test container configs used by GC tests to create / load containers.
 */
export const defaultGCConfig: ITestContainerConfig = {
    runtimeOptions: {
        summaryOptions: {
            disableSummaries: true,
            summaryConfigOverrides: { state: "disabled" },
        },
        gcOptions: { gcAllowed: true },
    },
    loaderProps: { configProvider: mockConfigProvider() },
};
