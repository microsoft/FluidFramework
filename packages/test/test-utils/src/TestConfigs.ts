/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ConfigTypes, IConfigProviderBase } from "@fluidframework/telemetry-utils";

export const mockConfigProvider = ((settings: Record<string, ConfigTypes> = {}): IConfigProviderBase => {
    settings["Fluid.GarbageCollection.TrackGCState"] = "true";
    settings["Fluid.GarbageCollection.WriteDataAtRoot"] = "true";
    return {
        getRawConfig: (name: string): ConfigTypes => settings[name],
    };
});
