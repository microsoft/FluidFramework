/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerRuntimeFactoryWithDefaultComponent } from "@microsoft/fluid-aqueduct";
import { Spaces } from "./spaces";
import { spacesInternalRegistryEntries } from "./spacesComponentRegistry";

export * from "./interfaces";
export * from "./spaces";
export * from "./spacesView";
export * from "./storage";
export * from "./reducers";
export * from "./selectors";
export * from "./context";

export const fluidExport = new ContainerRuntimeFactoryWithDefaultComponent(
    Spaces.ComponentName,
    [
        [ Spaces.ComponentName, Promise.resolve(Spaces.getFactory()) ],
        ...spacesInternalRegistryEntries,
    ],
);
