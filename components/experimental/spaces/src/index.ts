/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerRuntimeFactoryWithDefaultComponent } from "@microsoft/fluid-aqueduct";
import { Spaces } from "./spaces";
import { spacesComponentRegistryEntries } from "./spacesComponentRegistry";

export * from "./spaces";
export * from "./spacesStorage/index";
export * from "./interfaces";

export const fluidExport = new ContainerRuntimeFactoryWithDefaultComponent(
    Spaces.ComponentName,
    [
        [ Spaces.ComponentName, Promise.resolve(Spaces.getFactory()) ],
        ...spacesComponentRegistryEntries,
    ],
);
