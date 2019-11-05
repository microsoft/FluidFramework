/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISequencedClient } from "@microsoft/fluid-protocol-definitions";

export interface IHelpTasks {
    robot: string[];

    browser: string[];
}

/**
 * For a given list of connected clients and tasks to run, this function calculates need for local & remote help.
 * Right now only one client (aka leader) is allowed to run tasks and ask for local and remote.
 * To become completely distributed, each client should take into account other client permissions
 * and calculate help list. Then each client will pick up work independently and only leader will
 * ask for help.
 * TODO: Make this run on all clients once services are hardened better.
 * @param runnerClientId - Client making this call.
 * @param clients - List of all clients currently in the system.
 * @param tasks - Tasks to be performed.
 */
export function analyzeTasks(
    runnerClientId: string,
    clients: Map<string, ISequencedClient>,
    tasks: string[]): IHelpTasks {
    const robotClients = [...clients].filter((client) => isRobot(client[1]));
    const handledTasks = robotClients.map((robot) => robot[1].client.type);
    const unhandledTasks = tasks.filter((task) => handledTasks.indexOf(task) === -1);
    if (unhandledTasks.length > 0) {
        const runnerClient = clients.get(runnerClientId);
        const permission = runnerClient.client && runnerClient.client.permission ? runnerClient.client.permission : [];
        const allowedTasks = unhandledTasks.filter((task) => permission && permission.indexOf(task) !== -1);
        const robotNeeded = unhandledTasks.filter((task) => permission && permission.indexOf(task) === -1);
        return {
            browser: allowedTasks,
            robot: robotNeeded,
        };
    }
}

function isRobot(client: ISequencedClient): boolean {
    return client.client && client.client.details.capabilities && !client.client.details.capabilities.interactive;
}
