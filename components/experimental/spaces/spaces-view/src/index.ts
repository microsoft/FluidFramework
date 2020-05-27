/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerRuntimeFactoryWithDefaultComponent } from "@fluidframework/aqueduct";
import { Spaces } from "./spaces";
import { spacesInternalRegistryEntries } from "./spacesComponentRegistry";

export * from "./spaces";
export * from "./spacesView";
export * from "./spacesStorageView";

export const fluidExport = new ContainerRuntimeFactoryWithDefaultComponent(
    Spaces.ComponentName,
    [
        [ Spaces.ComponentName, Promise.resolve(Spaces.getFactory()) ],
        ...spacesInternalRegistryEntries,
    ],
);
