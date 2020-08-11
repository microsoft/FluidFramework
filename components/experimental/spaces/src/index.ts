/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerRuntimeFactoryWithDefaultDataStore } from "@fluidframework/aqueduct";
import { Spaces } from "./spaces";

export * from "./spaces";
export * from "./spacesView";
export * from "./storage";

export const fluidExport = new ContainerRuntimeFactoryWithDefaultDataStore(
    Spaces.getFactory().type,
    [Spaces.getFactory()],
);
