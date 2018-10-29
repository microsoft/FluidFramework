import * as api from "@prague/client-api";
import { IClient, IHelpMessage, ITokenProvider, IUser } from "@prague/runtime-definitions";
import { loadDictionary } from "./dictionaryLoader";
import { IntelWork } from "./intelWork";
import { SnapshotWork } from "./snapshotWork";
import { SpellcheckerWork } from "./spellcheckerWork";
import { TranslationWork } from "./translationWork";

// If a client declares taks runnning capability in permission array, it must register to perform the task.
export function registerToWork(doc: api.Document, client: IClient, tokenProvider: ITokenProvider, workerConfig: any) {
    if (client.permission && client.permission.length > 0) {
        doc.on("localHelp", async (helpMessage: IHelpMessage) => {
            await performTasks(
                doc.id,
                doc.tenantId,
                doc.getUser(),
                tokenProvider,
                helpMessage.tasks,
                workerConfig).catch((err) => {
                console.error(err);
            });
        });
    }
}

async function performTasks(
    docId: string,
    tenantId: string,
    user: IUser,
    tokenProvider: ITokenProvider,
    tasks: string[],
    config: any) {
    const taskPromises = [];
    for (const task of tasks) {
        taskPromises.push(performTask(docId, tenantId, user, tokenProvider, task, config));
    }
    await Promise.all(taskPromises);
}

async function performTask(
    docId: string,
    tenantId: string,
    user: IUser,
    tokenProvider: ITokenProvider,
    task: string,
    config: any) {
    switch (task) {
        case "snapshot":
            const snapshotWork  = new SnapshotWork(
                docId,
                tenantId,
                user,
                tokenProvider,
                config,
                api.getDefaultDocumentService());
            await snapshotWork.start(task);
            break;
        case "intel":
            const intelWork  = new IntelWork(
                docId,
                tenantId,
                user,
                tokenProvider,
                config,
                api.getDefaultDocumentService());
            await intelWork.start(task);
            break;
        case "spell":
            loadDictionary(config.serverUrl).then(async (dictionary) => {
                const spellWork = new SpellcheckerWork(
                    docId,
                    tenantId,
                    user,
                    tokenProvider,
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
            const translationWork = new TranslationWork(
                docId,
                tenantId,
                user,
                tokenProvider,
                config,
                api.getDefaultDocumentService());
            await translationWork.start(task);
            break;
        default:
            throw new Error(`Unknown task type: ${task}`);
    }
}
