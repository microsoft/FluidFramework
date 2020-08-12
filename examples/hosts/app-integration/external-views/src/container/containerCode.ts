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
 * 1. Default data object name
 * 2. Map of string to factory for all data objects the Container can create directly
 *
 * In this example, we are only registering a single data object, but more complex examples will register multiple
 * data objects.
 */
export const DiceRollerContainerRuntimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore(
    DiceRollerInstantiationFactory.type,
    new Map([
        DiceRollerInstantiationFactory.registryEntry,
    ]),
);
