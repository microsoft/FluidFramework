/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { BaseContainerRuntimeFactory } from "@fluidframework/aqueduct";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { rootDataStoreRequestHandler } from "@fluidframework/request-handler";

import { OldestClientDiceRollerInstantiationFactory } from "./oldestClientDiceRoller";
import { TaskManagerDiceRollerInstantiationFactory } from "./taskManagerDiceRoller";

const registryEntries = new Map([
    OldestClientDiceRollerInstantiationFactory.registryEntry,
    TaskManagerDiceRollerInstantiationFactory.registryEntry,
]);

export const taskManagerDiceId = "taskManagerDice";
export const oldestClientDiceId = "oldestClientDice";

class TaskSelectionContainerRuntimeFactory extends BaseContainerRuntimeFactory {
    constructor() {
        super(registryEntries, undefined, [rootDataStoreRequestHandler]);
    }

    protected async containerInitializingFirstTime(runtime: IContainerRuntime) {
        // We'll create a dice roller for each methodology.
        const taskManagerDice = await runtime.createDataStore(TaskManagerDiceRollerInstantiationFactory.type);
        await taskManagerDice.trySetAlias(taskManagerDiceId);
        const oldestClientDice = await runtime.createDataStore(OldestClientDiceRollerInstantiationFactory.type);
        await oldestClientDice.trySetAlias(oldestClientDiceId);
    }
}

export const TaskSelectionFactory = new TaskSelectionContainerRuntimeFactory();
