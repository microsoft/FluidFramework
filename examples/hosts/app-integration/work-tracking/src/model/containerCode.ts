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

import type { ITaskList, IAppModel } from "../modelInterfaces";
import { AppModel } from "./appModel";
import { TaskListInstantiationFactory } from "./inventoryList";

export const inventoryListId = "default-inventory-list";

export class TaskListContainerRuntimeFactory extends ModelContainerRuntimeFactory<IAppModel> {
    constructor() {
        super(
            new Map([
                TaskListInstantiationFactory.registryEntry,
            ]), // registryEntries
        );
    }

    /**
     * {@inheritDoc ModelContainerRuntimeFactory.containerInitializingFirstTime}
     */
    protected async containerInitializingFirstTime(runtime: IContainerRuntime) {
        const inventoryList = await runtime.createDataStore(TaskListInstantiationFactory.type);
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
        const inventoryList = await requestFluidObject<ITaskList>(
            await runtime.getRootDataStore(inventoryListId),
            "",
        );
        return new AppModel(inventoryList, container);
    }
}
