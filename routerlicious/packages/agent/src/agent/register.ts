import * as api from "@prague/client-api";
import { IClient, ITokenProvider } from "@prague/container-definitions";
import { IHelpMessage } from "@prague/runtime-definitions";
import { RateLimitter } from "@prague/utils";
import { loadDictionary } from "./dictionaryLoader";
import { IntelWork } from "./intelWork";
import { SnapshotWork } from "./snapshotWork";
import { SpellcheckerWork } from "./spellcheckerWork";
import { TranslationWork } from "./translationWork";

// TODO: Move this to config.
const RequestWindowMS = 15000;

// If a client declares taks runnning capability in permission array, it must register to perform the task.
export function registerToWork(doc: api.Document, client: IClient, tokenProvider: ITokenProvider, workerConfig: any) {
    if (client.permission && client.permission.length > 0) {
        const rateLimitter = new RateLimitter(RequestWindowMS);
        doc.on("localHelp", async (helpMessage: IHelpMessage) => {
            const filteredTasks = rateLimitter.filter(doc.clientId, helpMessage.tasks);
            await performTasks(
                doc.id,
                doc.tenantId,
                tokenProvider,
                filteredTasks,
                workerConfig).catch((err) => {
                console.error(err);
            });
        });
        console.log(`Registered to perform tasks!`);
    }
}

async function performTasks(
    docId: string,
    tenantId: string,
    tokenProvider: ITokenProvider,
    tasks: string[],
    config: any) {
    const taskPromises = [];
    for (const task of tasks) {
        taskPromises.push(performTask(docId, tenantId, tokenProvider, task, config));
    }
    await Promise.all(taskPromises);
}

async function performTask(
    docId: string,
    tenantId: string,
    tokenProvider: ITokenProvider,
    task: string,
    config: any) {
    switch (task) {
        case "snapshot":
            const snapshotWork  = new SnapshotWork(
                docId,
                tenantId,
                tokenProvider,
                config,
                api.getDefaultDocumentService());
            await snapshotWork.start(task);
            break;
        case "intel":
            const intelWork  = new IntelWork(
                docId,
                tenantId,
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
                tokenProvider,
                config,
                api.getDefaultDocumentService());
            await translationWork.start(task);
            break;
        case "chaincode":
            throw new Error(`Not implemented yet: ${task}`);
        default:
            throw new Error(`Unknown task type: ${task}`);
    }
}
