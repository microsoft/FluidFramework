/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { BaseContainerRuntimeFactory } from "@fluidframework/aqueduct";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { RuntimeRequestHandler } from "@fluidframework/request-handler";
import { RequestParser, requestFluidObject } from "@fluidframework/runtime-utils";

import { OldestClientDiceRollerInstantiationFactory } from "./oldestClientDiceRoller";
import { TaskManagerDiceRollerInstantiationFactory } from "./taskManagerDiceRoller";
import { IDiceRoller } from "./interface";

const registryEntries = new Map([
    OldestClientDiceRollerInstantiationFactory.registryEntry,
    TaskManagerDiceRollerInstantiationFactory.registryEntry,
]);

export const taskManagerDiceId = "taskManagerDice";
export const oldestClientDiceId = "oldestClientDice";

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
        const diceId = request.pathParts[0];
        if (diceId === taskManagerDiceId || diceId === oldestClientDiceId) {
            const dice = await requestObjectStoreFromId<IDiceRoller>(
                request, runtime, diceId);
            return { status: 200, mimeType: "fluid/object", value: dice };
        }
    };

class TaskSelectionContainerRuntimeFactory extends BaseContainerRuntimeFactory {
    constructor() {
        super(registryEntries, [], [requestHandler]);
    }

    protected async containerInitializingFirstTime(runtime: IContainerRuntime) {
        // We'll create a dice roller for each methodology.
        await runtime.createRootDataStore(TaskManagerDiceRollerInstantiationFactory.type, taskManagerDiceId);
        await runtime.createRootDataStore(OldestClientDiceRollerInstantiationFactory.type, oldestClientDiceId);
    }
}

export const TaskSelectionFactory = new TaskSelectionContainerRuntimeFactory();
