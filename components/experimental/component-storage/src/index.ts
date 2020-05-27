/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerRuntimeFactoryWithDefaultComponent } from "@microsoft/fluid-aqueduct";
import { ComponentStorage } from "./componentStorage";

export * from "./interfaces";
export * from "./componentStorage";

export const fluidExport = new ContainerRuntimeFactoryWithDefaultComponent(
    ComponentStorage.ComponentName,
    [
        [ ComponentStorage.ComponentName, Promise.resolve(ComponentStorage.getFactory()) ],
    ],
);
