/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ContainerRuntimeFactoryWithDefaultDataStore,
} from "@fluidframework/aqueduct";

import { DiceRoller, DiceRollerInstantiationFactory } from "./model";

/**
 * This does setup for the Container.
 *
 * There are two important things here:
 * 1. Default name
 * 2. Map of string to factory for all Fluid objects
 *
 * In this example, we are only registering a single Fluid objects, but more complex examples will register multiple
 * Fluid objects.
 */
export const DiceRollerContainerRuntimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore(
    DiceRollerInstantiationFactory,
    new Map([
        [DiceRoller.Name, Promise.resolve(DiceRollerInstantiationFactory)],
    ]),
);
