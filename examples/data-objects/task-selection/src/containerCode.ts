/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { BaseContainerRuntimeFactory } from "@fluidframework/aqueduct";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { RuntimeRequestHandler } from "@fluidframework/request-handler";
import { RequestParser, requestFluidObject } from "@fluidframework/runtime-utils";

import { TaskManagerDiceRoller, DiceRollerInstantiationFactory } from "./taskManagerDiceRoller";
import { IDiceRoller } from "./interface";

const registryEntries = new Map([
    DiceRollerInstantiationFactory.registryEntry,
]);

export const taskManagerDiceId = "taskManagerDice";

// Just a little helper, since we're going to request multiple objects.
async function requestObjectStoreFromId<T>(request: RequestParser, runtime: IContainerRuntime, id: string) {
    const fluidObjectRequest = RequestParser.create({
        url: ``,
        headers: request.headers,
    });
    return requestFluidObject<T>(
        await runtime.getRootDataStore(id),
        fluidObjectRequest);
}

const requestHandler: RuntimeRequestHandler =
    async (request: RequestParser, runtime: IContainerRuntime) => {
        if (request.pathParts[0] === taskManagerDiceId) {
            const taskManagerDice = await requestObjectStoreFromId<IDiceRoller>(
                request, runtime, taskManagerDiceId);
            return { status: 200, mimeType: "fluid/object", value: taskManagerDice };
        }
    };

class TaskSelectionContainerRuntimeFactory extends BaseContainerRuntimeFactory {
    constructor() {
        super(registryEntries, [], [requestHandler]);
    }

    protected async containerInitializingFirstTime(runtime: IContainerRuntime) {
        const taskManagerDiceRollerComponentRuntime =
            await runtime.createRootDataStore(TaskManagerDiceRoller.ComponentName, taskManagerDiceId);
        await requestFluidObject<IDiceRoller>(taskManagerDiceRollerComponentRuntime, "/");
    }
}

export const TaskSelectionFactory = new TaskSelectionContainerRuntimeFactory();
