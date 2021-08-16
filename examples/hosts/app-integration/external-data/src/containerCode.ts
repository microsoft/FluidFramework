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

import { ContainerKillBitInstantiationFactory } from "./containerKillBit";
import { InventoryListInstantiationFactory } from "./inventoryList";

const inventoryListId = "default-inventory-list";
const containerKillBitId = "container-kill-bit";

export class InventoryListContainerRuntimeFactory extends BaseContainerRuntimeFactory {
    constructor() {
        super(
            new Map([
                InventoryListInstantiationFactory.registryEntry,
                ContainerKillBitInstantiationFactory.registryEntry,
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
        await Promise.all([
            runtime.createRootDataStore(
                InventoryListInstantiationFactory.type,
                inventoryListId,
            ),
            runtime.createRootDataStore(
                ContainerKillBitInstantiationFactory.type,
                containerKillBitId,
            ),
        ]);
    }
}
