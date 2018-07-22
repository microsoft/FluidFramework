import { api, core } from "../client-api";
import { loadDictionary } from "./dictionaryLoader";
import { IntelWork } from "./intelWork";
import { SnapshotWork } from "./snapshotWork";
import { SpellcheckerWork } from "./spellcheckerWork";
import { TranslationWork } from "./translationWork";

// If a client declares taks runnning capability in permission array, it must register to perform the task.
export function registerToWork(doc: api.Document, client: core.IClient, token: string, workerConfig: any) {
    if (client.permission && client.permission.length > 0) {
        doc.on("localHelp", async (helpMessage: core.IHelpMessage) => {
            await performTasks(doc.id, token, helpMessage.tasks, workerConfig).catch((err) => {
                console.error(err);
            });
        });
    }
}

async function performTasks(docId: string, token: string, tasks: string[], config: any) {
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
            loadDictionary(config.serverUrl).then(async (dictionary) => {
                const spellWork = new SpellcheckerWork(
                    docId,
                    token,
                    config,
                    dictionary,
                    api.getDefaultDocumentService(),
                );
                await spellWork.start(task);
            }, (err) => {
                console.log(err);
            });
            break;
        case "translation":
            const translationWork = new TranslationWork(docId, token, config, api.getDefaultDocumentService());
            await translationWork.start(task);
            break;
        default:
            throw new Error(`Unknown task type: ${task}`);
    }
}
