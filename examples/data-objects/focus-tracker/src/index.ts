/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerRuntimeFactoryWithDefaultDataStore } from "@fluid-experimental/fluid-framework";
import { FocusTracker } from "./FocusTracker";

export * from "./FocusTracker";

export const fluidExport = new ContainerRuntimeFactoryWithDefaultDataStore(
    FocusTracker.factory,
    new Map([
        [FocusTracker.Name, Promise.resolve(FocusTracker.factory)],
    ]),
);
