/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITestContainerConfig, mockConfigProvider } from "@fluidframework/test-utils";

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
