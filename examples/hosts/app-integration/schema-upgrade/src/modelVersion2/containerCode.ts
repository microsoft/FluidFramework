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

import type { IMigrationTool } from "../migrationInterfaces";
import { MigrationToolInstantiationFactory } from "../migrationTool";
import type { IInventoryList, IInventoryListAppModel } from "../modelInterfaces";
import { InventoryListAppModel } from "./appModel";
import { InventoryListInstantiationFactory } from "./inventoryList";

export const inventoryListId = "default-inventory-list";
export const migrationToolId = "migration-tool";

export class InventoryListContainerRuntimeFactory extends ModelContainerRuntimeFactory<IInventoryListAppModel> {
    constructor() {
        super(
            new Map([
                InventoryListInstantiationFactory.registryEntry,
                MigrationToolInstantiationFactory.registryEntry,
            ]), // registryEntries
        );
    }

    /**
     * {@inheritDoc ModelContainerRuntimeFactory.containerInitializingFirstTime}
     */
    protected async containerInitializingFirstTime(runtime: IContainerRuntime) {
        const inventoryList = await runtime.createDataStore(InventoryListInstantiationFactory.type);
        await inventoryList.trySetAlias(inventoryListId);
        const migrationTool = await runtime.createDataStore(MigrationToolInstantiationFactory.type);
        await migrationTool.trySetAlias(migrationToolId);
    }

    /**
     * {@inheritDoc ModelContainerRuntimeFactory.containerHasInitialized}
     */
    protected async containerHasInitialized(runtime: IContainerRuntime) {
        console.info("Using runtime factory version two");
        // Force the MigrationTool to instantiate in all cases.  The Quorum it uses must be loaded and running in
        // order to respond with accept ops, and without this call the MigrationTool won't be instantiated on the
        // summarizer client.
        await requestFluidObject(await runtime.getRootDataStore(migrationToolId), "");
    }

    /**
     * {@inheritDoc ModelContainerRuntimeFactory.createModel}
     */
     protected async createModel(runtime: IContainerRuntime, container: IContainer) {
        const inventoryList = await requestFluidObject<IInventoryList>(
            await runtime.getRootDataStore(inventoryListId),
            "",
        );
        const migrationTool = await requestFluidObject<IMigrationTool>(
            await runtime.getRootDataStore(migrationToolId),
            "",
        );
        return new InventoryListAppModel(inventoryList, migrationTool, container);
    }
}
