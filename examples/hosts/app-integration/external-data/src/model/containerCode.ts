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

/**
 * {@inheritDoc ModelContainerRuntimeFactory}
 */
export class TaskListContainerRuntimeFactory extends ModelContainerRuntimeFactory<IAppModel> {
    public constructor() {
        super(
            new Map([TaskListInstantiationFactory.registryEntry]), // registryEntries
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
        // const taskList = await requestFluidObject<ITaskList>(
        //     await runtime.getRootDataStore(taskListId),
        //     "",
        // );
        runtime.on("signal", (message) => {
            console.log("I am inside the example code and I am now receiving the message");
            console.log(message);
            console.log(runtime);
            // await taskList.handleSignal(message);
            // TODO: Check the message type? clientId?  And route to the TaskList for interpretation?
            // Interpretation of the message contents should probably live on the TaskList to encapsulate
            // knowledge of the task-specific data.
            // this is just the signal to say go fetch external data
            // explore how the signal from the outside trigger importExternalData
            // 1. one option is to literally trigger importExternalData
            // 2. or you can call handleExternalDataSignal and it does the work of figuring out what to do
            // maintain a registry of signals coming in and what it means when it gets handed off to
            // (envelope gets differently all over the code and will have interesting payload that is meaningful)
        });
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
