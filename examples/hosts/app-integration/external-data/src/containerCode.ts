/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerRuntimeFactoryWithDefaultDataStore } from "@fluidframework/aqueduct";

import { InventoryListInstantiationFactory } from "./dataObject";

/**
 * The InventoryListContainerRuntimeFactory is the container code for our scenario.
 *
 * Since we only need to instantiate and retrieve a single inventory list for our scenario, we can use a
 * ContainerRuntimeFactoryWithDefaultDataStore. We provide it with the type of the data object we want to create
 * and retrieve by default, and the registry entry mapping the type to the factory.
 *
 * This container code will create the single default data object on our behalf and make it available on the
 * Container with a URL of "/", so it can be retrieved via container.request("/").
 */
export const InventoryListContainerRuntimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore(
    InventoryListInstantiationFactory,
    new Map([
        InventoryListInstantiationFactory.registryEntry,
    ]),
);
