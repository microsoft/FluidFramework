import * as api from "../api-core";

export interface IHelpTasks {
    robot: string[];

    browser: string[];
}

export function analyze(
    runnerClientId: string,
    runnerClient: api.IClient,
    clients: Map<string, api.IClient>,
    tasks: string[]): IHelpTasks {
    const robotClients = [...clients].filter((client) => client[1] && client[1].type !== api.Browser);
    const handledTasks = robotClients.map((robot) => robot[1].type);
    const unhandledTasks = tasks.filter((task) => handledTasks.indexOf(task) === -1);
    if (unhandledTasks.length > 0) {
        const otherBrowserPermission: Set<string> = new Set<string>();
        for (const client of clients) {
            if (runnerClientId === client[0] || (client[1] && client[1].type !== api.Browser)) {
                continue;
            }
            for (const permission of client[1].permission) {
                otherBrowserPermission.add(permission);
            }
        }
        const helpNeeded = unhandledTasks.filter((task) => !otherBrowserPermission.has(task));
        const allowedTasks = helpNeeded.filter((task) => runnerClient.permission.indexOf(task) !== -1);
        const robotNeeded = helpNeeded.filter((task) => runnerClient.permission.indexOf(task) === -1);
        return {
            browser: allowedTasks,
            robot: robotNeeded,
        };
    }
}
