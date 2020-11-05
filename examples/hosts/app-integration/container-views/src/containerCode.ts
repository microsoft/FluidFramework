/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerRuntimeFactoryWithDefaultDataStore } from "@fluidframework/aqueduct";
import { FluidDataStoreRegistry } from "@fluidframework/runtime-utils";

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
    DiceRoller.Name,
    new FluidDataStoreRegistry([
        [DiceRoller.Name, Promise.resolve(DiceRollerInstantiationFactory)],
    ]),
);
