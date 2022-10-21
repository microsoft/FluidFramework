/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ModelContainerRuntimeFactory,
} from "@fluid-example/example-utils";
import type { IContainer } from "@fluidframework/container-definitions";
import type { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";

import type { IInventoryList, IInventoryListAppModel } from "../modelInterfaces";
import { InventoryListAppModel } from "./appModel";
import { InventoryListInstantiationFactory } from "./inventoryList";

export const inventoryListId = "default-inventory-list";

export class InventoryListContainerRuntimeFactory extends ModelContainerRuntimeFactory<IInventoryListAppModel> {
    constructor() {
        super(
            new Map([
                InventoryListInstantiationFactory.registryEntry,
            ]), // registryEntries
        );
    }

    /**
     * {@inheritDoc ModelContainerRuntimeFactory.containerInitializingFirstTime}
     */
    protected async containerInitializingFirstTime(runtime: IContainerRuntime) {
        const inventoryList = await runtime.createDataStore(InventoryListInstantiationFactory.type);
        await inventoryList.trySetAlias(inventoryListId);
    }

    /**
     * {@inheritDoc ModelContainerRuntimeFactory.containerHasInitialized}
     */
    protected async containerHasInitialized(runtime: IContainerRuntime) {
    }

    /**
     * {@inheritDoc ModelContainerRuntimeFactory.createModel}
     */
     protected async createModel(runtime: IContainerRuntime, container: IContainer) {
        const inventoryList = await requestFluidObject<IInventoryList>(
            await runtime.getRootDataStore(inventoryListId),
            "",
        );
        return new InventoryListAppModel(inventoryList, container);
    }
}
