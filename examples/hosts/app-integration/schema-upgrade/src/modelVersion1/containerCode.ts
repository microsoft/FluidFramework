/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { BaseContainerRuntimeFactory } from "@fluidframework/aqueduct";
import { IContainer } from "@fluidframework/container-definitions";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { rootDataStoreRequestHandler } from "@fluidframework/request-handler";
import { requestFluidObject } from "@fluidframework/runtime-utils";

import { MigrationToolInstantiationFactory, IMigrationTool } from "../migrationTool";
import { IInventoryList, IInventoryListContainer } from "../modelInterfaces";
import { makeModelRequestHandler, ModelMakerCallback } from "../modelLoading";
import { InventoryListContainer } from "./containerModel";
import { InventoryListInstantiationFactory } from "./inventoryList";

export const inventoryListId = "default-inventory-list";
export const migrationToolId = "migration-tool";

const makeInventoryListModel: ModelMakerCallback<IInventoryListContainer> =
    async (runtime: IContainerRuntime, container: IContainer) => {
        const inventoryList = await requestFluidObject<IInventoryList>(
            await runtime.getRootDataStore(inventoryListId),
            "",
        );
        const migrationTool = await requestFluidObject<IMigrationTool>(
            await runtime.getRootDataStore(migrationToolId),
            "",
        );
        return new InventoryListContainer(inventoryList, migrationTool, container);
    };

export class InventoryListContainerRuntimeFactory extends BaseContainerRuntimeFactory {
    constructor() {
        super(
            new Map([
                InventoryListInstantiationFactory.registryEntry,
                MigrationToolInstantiationFactory.registryEntry,
            ]), // registryEntries
            undefined,
            [
                makeModelRequestHandler(makeInventoryListModel),
                rootDataStoreRequestHandler,
            ],
        );
    }

    /**
     * {@inheritDoc BaseContainerRuntimeFactory.containerInitializingFirstTime}
     */
    protected async containerInitializingFirstTime(runtime: IContainerRuntime) {
        const inventoryList = await runtime.createDataStore(InventoryListInstantiationFactory.type);
        await inventoryList.trySetAlias(inventoryListId);
        const migrationTool = await runtime.createDataStore(MigrationToolInstantiationFactory.type);
        await migrationTool.trySetAlias(migrationToolId);
    }

    protected async containerHasInitialized(runtime: IContainerRuntime): Promise<void> {
        console.info("Using runtime factory version one");
        // Force the MigrationTool to instantiate in all cases.  The Quorum it uses must be loaded and running in
        // order to respond with accept ops, and without this call the MigrationTool won't be instantiated on the
        // summarizer client.
        await requestFluidObject(await runtime.getRootDataStore(migrationToolId), "");
    }
}
