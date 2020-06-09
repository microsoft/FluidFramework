/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ContainerRuntimeFactoryWithDefaultComponent,
} from "@fluidframework/aqueduct";

import { PrimitivesName } from "./main";
import { PrimitivesInstantiationFactory } from "./primitivesInstantiationFactory";

/**
 * This does setup for the Container. The ContainerRuntimeFactoryWithDefaultComponent also enables dynamic loading in
 * the EmbeddedComponentLoader.
 *
 * There are two important things here:
 * 1. Default Component name
 * 2. Map of string to factory for all components
 *
 * In this example, we are only registering a single component, but more complex examples will register multiple
 * components.
 */
export const fluidExport = new ContainerRuntimeFactoryWithDefaultComponent(
    PrimitivesName,
    new Map([
        [PrimitivesName, Promise.resolve(PrimitivesInstantiationFactory)],
    ]),
);
