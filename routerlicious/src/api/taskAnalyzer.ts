import * as api from "../api-core";

export interface IHelpTasks {
    robot: string[];

    browser: string[];
}

// For a given list of connected clients and tasks to run, this function calculates need for local & remote help.

// Right now only one client (aka leader) is allowed to run tasks and ask for local and remote.
// To become completely distributed, each client should take into account other client permissions
// and calculate help list. Then each client will pick up work independently and only leader will
// ask for help.

// TODO: Make this run on all clients once services are hardened better.
export function analyzeTasks(
    runnerClientId: string,
    clients: Map<string, api.IClient>,
    tasks: string[]): IHelpTasks {
    const robotClients = [...clients].filter((client) => isRobot(client[1]));
    const handledTasks = robotClients.map((robot) => robot[1].type);
    const unhandledTasks = tasks.filter((task) => handledTasks.indexOf(task) === -1);
    if (unhandledTasks.length > 0) {
        const runnerClient = clients.get(runnerClientId);
        const permission = runnerClient ? runnerClient.permission : [];
        const allowedTasks = unhandledTasks.filter((task) => permission && permission.indexOf(task) !== -1);
        const robotNeeded = unhandledTasks.filter((task) => permission && permission.indexOf(task) === -1);
        return {
            browser: allowedTasks,
            robot: robotNeeded,
        };
    }
}

export function isNewLeader(clients: Map<string, api.IClient>, clientId: string): boolean {
    const firstBrowserClient = getFirstBrowserClient(clients);
    return firstBrowserClient && firstBrowserClient.clientId === clientId;
}

function isRobot(client: api.IClient): boolean {
    return client && client.type !== api.Browser;
}

function getFirstBrowserClient(clients: Map<string, api.IClient>): api.IClientDetail {
    for (const client of clients) {
        if (!isRobot(client[1])) {
            return {
                clientId: client[0],
                detail: client[1],
            };
        }
    }
}
