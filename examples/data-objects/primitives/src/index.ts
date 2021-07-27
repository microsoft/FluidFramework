/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ContainerRuntimeFactoryWithDefaultDataStore,
} from "@fluidframework/aqueduct";

import { DdsCollectionName } from "./model";
import { PrimitivesInstantiationFactory } from "./primitivesInstantiationFactory";

/**
 * This does setup for the Container. The ContainerRuntimeFactoryWithDefaultDataStore also enables dynamic loading in
 * the EmbeddedComponentLoader.
 *
 * There are two important things here:
 * 1. Default Component name
 * 2. Map of string to factory for all components
 *
 * In this example, we are only registering a single component, but more complex examples will register multiple
 * components.
 */
export const fluidExport = new ContainerRuntimeFactoryWithDefaultDataStore(
    PrimitivesInstantiationFactory,
    new Map([
        [DdsCollectionName, Promise.resolve(PrimitivesInstantiationFactory)],
    ]),
);
