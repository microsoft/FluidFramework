/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerRuntimeFactoryWithDefaultDataStore } from "@fluidframework/aqueduct";

import { PropertyTreeInstantiationFactory } from "./dataObject";

export const PropertyTreeContainerRuntimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore(
    PropertyTreeInstantiationFactory,
    new Map([
        ['property-tree', Promise.resolve(PropertyTreeInstantiationFactory)]
    ]),
);
