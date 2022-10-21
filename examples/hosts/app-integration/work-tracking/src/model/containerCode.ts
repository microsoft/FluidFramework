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
import { TaskListInstantiationFactory } from "./taskList";

export const taskListId = "default-task-list";

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
        const taskList = await runtime.createDataStore(TaskListInstantiationFactory.type);
        await taskList.trySetAlias(taskListId);
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
        const taskList = await requestFluidObject<ITaskList>(
            await runtime.getRootDataStore(taskListId),
            "",
        );
        return new AppModel(taskList, container);
    }
}
