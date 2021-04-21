/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ContainerRuntimeFactoryWithDefaultDataStore,
} from "@fluidframework/aqueduct";

import { DiceRoller, DiceRollerInstantiationFactory } from "./main";

export { DiceRoller, DiceRollerInstantiationFactory } from "./main";

/**
 * This does setup for the Container. The ContainerRuntimeFactoryWithDefaultDataStore also enables dynamic loading by
 * providing the fluidExport constant.
 *
 * There are two important things here:
 * 1. Default Fluid object name
 * 2. Map of string to factory for all dependent Fluid objects
 *
 * In this example, we are only registering a single Fluid object, but more complex examples will register multiple
 * Fluid objects.
 */
export const fluidExport = new ContainerRuntimeFactoryWithDefaultDataStore(
    DiceRollerInstantiationFactory,
    new Map([
        [DiceRoller.Name, Promise.resolve(DiceRollerInstantiationFactory)],
    ]),
);
