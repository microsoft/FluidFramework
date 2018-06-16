import { api, core } from "../client-api";
import { ITaskRunnerConfig } from "./definitions";
import { SnapshotWork } from "./snapshotWork";

export function registerToWork(doc: api.Document, config: ITaskRunnerConfig, token: string) {
    if (config.permission && config.permission.length > 0) {
        const permittedTasks = config.permission;
        doc.on("help", async (message: core.IHelpMessage) => {
            // For now only leader will accept the work.
            // TODO: Find a reliable way to ack this help message exactly once by any client.
            if (message.clientId === doc.clientId) {
                const tasksToDo = [];
                for (const task of message.tasks) {
                    if (permittedTasks.indexOf(task) !== -1) {
                        tasksToDo.push(task);
                    }
                }
                if (tasksToDo.length > 0) {
                    await performTasks(doc.id, token, tasksToDo).catch((err) => {
                        console.error(err);
                    });
                }
            }
        });
    }
}

// TODO: Make this for every work types. Move this over to webworker. And allow it not to reconnect in api.load.
async function performTasks(docId: string, token: string, tasks: string[]) {
    const taskPromises = [];
    for (const task of tasks) {
        taskPromises.push(performTask(docId, token, task));
    }
    await Promise.all(taskPromises);
}

async function performTask(docId: string, token: string, task: string) {
    switch (task) {
        case "snapshot":
            const snapshotWork  = new SnapshotWork(docId, token, {}, api.getDefaultDocumentService());
            await snapshotWork.start(task);
            break;
        default:
            throw new Error("Unknown task type");
    }
}
