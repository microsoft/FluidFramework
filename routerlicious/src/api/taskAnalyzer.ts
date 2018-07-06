import * as api from "../api-core";

export interface IHelpTasks {
    robot: string[];

    browser: string[];
}

// For a given list of connected clients and tasks to run, this function calculates need for local & remote help.
// To make sure that a task is only requested once, this also takes already requested tasks into account.

// Right now only one client (aka leader) is allowed to run tasks and ask for local and remote.
// To become completely distributed, each client should take into account other client permissions
// and calculate help list. Then each client will pick up work independently and only leader will
// ask for help.

// TODO: Make this run on all clients once services are hardened better.
export function analyzeTasks(
    runnerClientId: string,
    clients: Map<string, api.IClient>,
    tasks: string[],
    requestedTasks: Set<string>): IHelpTasks {
    const robotClients = [...clients].filter((client) => isRobot(client[1]));
    const handledTasks = robotClients.map((robot) => robot[1].type);
    const unhandledTasks = tasks.filter((task) => handledTasks.indexOf(task) === -1);
    if (unhandledTasks.length > 0) {
        const runnerClient = clients.get(runnerClientId);
        const permission = runnerClient ? runnerClient.permission : [];
        const allowedTasks = unhandledTasks.filter(
            (task) => permission && permission.indexOf(task) !== -1 && !requestedTasks.has(task));
        const robotNeeded = unhandledTasks.filter(
            (task) => permission && permission.indexOf(task) === -1 && !requestedTasks.has(task));
        addToRequestedTasks(requestedTasks, allowedTasks);
        addToRequestedTasks(requestedTasks, robotNeeded);
        return {
            browser: allowedTasks,
            robot: robotNeeded,
        };
    }
}

export function getLeader(clients: Map<string, api.IClient>): api.IClientDetail {
    for (const client of clients) {
        if (!isRobot(client[1])) {
            return {
                clientId: client[0],
                detail: client[1],
            };
        }
    }
}

function addToRequestedTasks(requestedTasks: Set<string>, tasks: string[]) {
    for (const task of tasks) {
        requestedTasks.add(task);
    }
}

function isRobot(client: api.IClient): boolean {
    return client && client.type !== api.Browser;
}
