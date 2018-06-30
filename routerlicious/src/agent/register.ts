import { api, core } from "../client-api";
import { loadDictionary } from "./dictionaryLoader";
import { IntelWork } from "./intelWork";
import { SnapshotWork } from "./snapshotWork";
import { SpellcheckerWork } from "./spellcheckerWork";
import { TranslationWork } from "./translationWork";
import { getTaskMapView } from "./utils";

// Try to grab any allowed task on first load and then when a client leaves.
export function registerToWork(doc: api.Document, client: core.IClient, token: string, workerConfig: any) {
    if (client.permission && client.permission.length > 0) {
        const permittedTasks = client.permission;
        startUnassignedTasks(doc, permittedTasks, token, workerConfig).catch((err) => {
            console.error(err);
        });
        doc.on("clientLeave", async () => {
            // To prevent multiple clients picking up the same work, only first browser client is allowed.
            const firstClient = doc.getFirstBrowserClient();
            if (firstClient && firstClient.clientId === doc.clientId) {
                await startUnassignedTasks(doc, permittedTasks, token, workerConfig).catch((err) => {
                    console.error(err);
                });
            }
        });
    }
}

async function startUnassignedTasks(doc: api.Document, permittedTasks: string[], token: string, workerConfig: any) {
    const taskMapView = await getTaskMapView(doc);
    const tasksToDo = [];
    for (const task of taskMapView.keys()) {
        const clientId = taskMapView.get(task);
        if (clientId && doc.getClients().has(clientId)) {
            continue;
        }
        if (permittedTasks.indexOf(task) !== -1) {
            tasksToDo.push(task);
        }
    }
    if (tasksToDo.length > 0) {
        await performTasks(doc.id, token, tasksToDo, workerConfig);
    }
}

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
