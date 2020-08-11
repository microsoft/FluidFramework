/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ContainerRuntimeFactoryWithDefaultDataStore,
} from "@fluidframework/aqueduct";

import { DiceRollerInstantiationFactory } from "../dataObject";

/**
 * This does setup for the Container.
 *
 * There are two important things here:
 * 1. Default Data Object name
 * 2. Map of string to factory for all Data Objects the Container can create directly
 *
 * In this example, we are only registering a single Data Object, but more complex examples will register multiple
 * Data Objects.
 */
export const DiceRollerContainerRuntimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore(
    DiceRollerInstantiationFactory.type,
    new Map([
        DiceRollerInstantiationFactory.registryEntry,
    ]),
);
