import { api, core } from "../client-api";
import { ITaskRunnerConfig } from "./definitions";
import { loadDictionary } from "./dictionaryLoader";
import { IntelWork } from "./intelWork";
import { SnapshotWork } from "./snapshotWork";
import { SpellcheckerWork } from "./spellcheckerWork";
import { TranslationWork } from "./translationWork";

export function registerToWork(doc: api.Document, config: ITaskRunnerConfig, token: string, workerConfig: any) {
    if (config.permission && config.permission.length > 0) {
        const permittedTasks = config.permission;
        doc.on("clientHelp", async (message: core.IHelpMessage) => {
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
                    await performTasks(doc.id, token, tasksToDo, workerConfig).catch((err) => {
                        console.error(err);
                    });
                }
            }
        });
    }
}

// TODO: Make this for every work types. Move this over to webworker. And allow it not to reconnect in api.load.
async function performTasks(docId: string, token: string, tasks: string[], config) {
    const taskPromises = [];
    for (const task of tasks) {
        taskPromises.push(performTask(docId, token, task, config));
    }
    await Promise.all(taskPromises);
}

async function performTask(docId: string, token: string, task: string, config: any) {
    switch (task) {
        case "snapshot":
            const snapshotWork  = new SnapshotWork(docId, token, config, api.getDefaultDocumentService());
            await snapshotWork.start(task);
            break;
        case "intel":
            const intelWork  = new IntelWork(docId, token, config, api.getDefaultDocumentService());
            await intelWork.start(task);
            break;
        case "spell":
            const dictionary = await loadDictionary(config.serverUrl);
            const spellWork = new SpellcheckerWork(
                docId,
                token,
                config,
                dictionary,
                api.getDefaultDocumentService(),
            );
            await spellWork.start(task);
            break;
        case "translation":
            const translationWork = new TranslationWork(docId, token, config, api.getDefaultDocumentService());
            await translationWork.start(task);
            break;
        default:
            throw new Error(`Unknown task type: ${task}`);
    }
}
