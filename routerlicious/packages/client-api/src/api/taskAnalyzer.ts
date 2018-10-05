import { Browser, IClient, IClientJoin } from "@prague/runtime-definitions";

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
    clients: Map<string, IClient>,
    tasks: string[]): IHelpTasks {
    const robotClients = [...clients].filter((client) => isRobot(client[1]));
    const handledTasks = robotClients.map((robot) => robot[1].type);
    const unhandledTasks = tasks.filter((task) => handledTasks.indexOf(task) === -1);
    if (unhandledTasks.length > 0) {
        const runnerClient = clients.get(runnerClientId);
        /* tslint:disable:strict-boolean-expressions */
        const permission = runnerClient ? runnerClient.permission : [];
        const allowedTasks = unhandledTasks.filter((task) => permission && permission.indexOf(task) !== -1);
        const robotNeeded = unhandledTasks.filter((task) => permission && permission.indexOf(task) === -1);
        return {
            browser: allowedTasks,
            robot: robotNeeded,
        };
    }
}

export function getLeader(clients: Map<string, IClient>): IClientJoin {
    for (const client of clients) {
        if (!isRobot(client[1])) {
            return {
                clientId: client[0],
                detail: client[1],
            };
        }
    }
}

function isRobot(client: IClient): boolean {
    return client && client.type !== Browser;
}
