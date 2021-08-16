/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    BaseContainerRuntimeFactory,
    defaultRouteRequestHandler,
} from "@fluidframework/aqueduct";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { rootDataStoreRequestHandler } from "@fluidframework/request-handler";

import { InventoryListInstantiationFactory } from "./dataObject";

const inventoryListId = "inventory-list";

export class InventoryListContainerRuntimeFactory extends BaseContainerRuntimeFactory {
    constructor() {
        super(
            new Map([
                InventoryListInstantiationFactory.registryEntry,
            ]), // registryEntries
            [], // providerEntries
            [
                defaultRouteRequestHandler(inventoryListId),
                rootDataStoreRequestHandler,
            ],
        );
    }

    /**
     * {@inheritDoc BaseContainerRuntimeFactory.containerInitializingFirstTime}
     */
    protected async containerInitializingFirstTime(runtime: IContainerRuntime) {
        await runtime.createRootDataStore(
            InventoryListInstantiationFactory.type,
            inventoryListId,
        );
    }
}
