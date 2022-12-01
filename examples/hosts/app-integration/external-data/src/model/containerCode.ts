/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ModelContainerRuntimeFactory } from "@fluid-example/example-utils";
import type { IContainer } from "@fluidframework/container-definitions";
import type { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";

import type { ITaskList, IAppModel } from "../modelInterfaces";
import { AppModel } from "./appModel";
import { TaskListInstantiationFactory } from "./taskList";

const taskListId = "task-list";
const SignalType = {
    ExternalDataChanged: "externalDataChange"
};

/**
 * {@inheritDoc ModelContainerRuntimeFactory}
 */
export class TaskListContainerRuntimeFactory extends ModelContainerRuntimeFactory<IAppModel> {
    constructor() {
        super(
            new Map([TaskListInstantiationFactory.registryEntry]), // registryEntries
        );
    }

    /**
     * {@inheritDoc ModelContainerRuntimeFactory.containerInitializingFirstTime}
     */
    protected async containerInitializingFirstTime(runtime: IContainerRuntime): Promise<void> {
        const taskList = await runtime.createDataStore(TaskListInstantiationFactory.type);
        await taskList.trySetAlias(taskListId);
    }

    /**
     * {@inheritDoc ModelContainerRuntimeFactory.containerHasInitialized}
     */
    protected async containerHasInitialized(runtime: IContainerRuntime): Promise<void> {
        runtime.on("signal", (message) => {
            // TODO: Check the message type? clientId?  And route to the TaskList for interpretation?
            // Interpretation of the message contents should probably live on the TaskList to encapsulate
            // knowledge of the task-specific data.
        });
    }

    /**
     * {@inheritDoc ModelContainerRuntimeFactory.createModel}
     */
    protected async createModel(runtime: IContainerRuntime, container: IContainer): Promise<AppModel> {
        const taskList = await requestFluidObject<ITaskList>(
            await runtime.getRootDataStore(taskListId),
            "",
        );
        // Register listener only once the model is fully loaded and ready
        runtime.on("signal", (message) => {
            if (message.type === SignalType.ExternalDataChanged) {
                taskList.importExternalData();
            }
        });
        return new AppModel(taskList, container);
    }
}
