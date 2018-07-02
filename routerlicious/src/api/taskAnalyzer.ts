import * as api from "../api-core";

export function analyze(clients: Map<string, api.IClient>, tasks: string[]) {
    const robots = [...clients].filter((client) => client[1] && client[1].type !== api.Browser);
    const handledTasks = robots.map((robot) => robot[1].type);
}