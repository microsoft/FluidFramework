/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ContainerRuntimeFactoryWithDefaultDataStore,
} from "@fluidframework/aqueduct";

import { VersiontestInstantiationFactory1, VersiontestInstantiationFactory2 } from "./main";

export const fluidExport = new ContainerRuntimeFactoryWithDefaultDataStore(
    VersiontestInstantiationFactory2.type,
    [
        VersiontestInstantiationFactory1,
        VersiontestInstantiationFactory2,
    ],
);
