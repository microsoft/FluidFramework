/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    rootDataStoreRequestHandler,
} from "@fluidframework/request-handler";
import { ContainerRuntimeFactoryWithDefaultDataStore } from "@fluidframework/aqueduct";
import { SharedTextDataStoreFactory } from "./component";

export const fluidExport = new ContainerRuntimeFactoryWithDefaultDataStore(
    SharedTextDataStoreFactory,
    new Map([
        [SharedTextDataStoreFactory.type, Promise.resolve(SharedTextDataStoreFactory)]
    ]),
    undefined,
    [rootDataStoreRequestHandler],
);
