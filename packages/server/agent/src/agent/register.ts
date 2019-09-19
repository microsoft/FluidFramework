/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IHelpMessage } from "@microsoft/fluid-runtime-definitions";
import * as api from "@fluid-internal/client-api";
import { IHost } from "@microsoft/fluid-container-definitions";
import { IClient } from "@microsoft/fluid-protocol-definitions";
import { RateLimiter } from "@microsoft/fluid-core-utils";
import { debug } from "./debug";
import { loadDictionary } from "./dictionaryLoader";
import { IntelWork } from "./intelWork";
import { SnapshotWork } from "./snapshotWork";
import { SpellcheckerWork } from "./spellcheckerWork";
import { TranslationWork } from "./translationWork";

// TODO: Move this to config.
const RequestWindowMS = 15000;

// If a client declares taks runnning capability in permission array, it must register to perform the task.
export function registerToWork(
    alfred: string,
    doc: api.Document,
    client: IClient,
    host: IHost,
    workerConfig: any,
    tenantId: string,
    documentId: string) {
    if (client.permission && client.permission.length > 0) {
        const rateLimiter = new RateLimiter(RequestWindowMS);
        doc.on("localHelp", async (helpMessage: IHelpMessage) => {
            const filteredTasks = rateLimiter.filter(doc.clientId, helpMessage.tasks);
            await performTasks(
                alfred,
                documentId,
                tenantId,
                host,
                filteredTasks,
                workerConfig).catch((err) => {
                console.error(err);
            });
        });
        debug(`Registered to perform tasks!`);
    }
}

async function performTasks(
    alfred: string,
    docId: string,
    tenantId: string,
    host: IHost,
    tasks: string[],
    config: any) {
    const taskPromises = [];
    for (const task of tasks) {
        taskPromises.push(performTask(alfred, docId, tenantId, host, task, config));
    }
    await Promise.all(taskPromises);
}

async function performTask(
    alfred: string,
    docId: string,
    tenantId: string,
    host: IHost,
    task: string,
    config: any) {
    switch (task) {
        case "snapshot":
            const snapshotWorkP  = new SnapshotWork(
                alfred,
                docId,
                tenantId,
                host,
                config,
                api.getDefaultDocumentServiceFactory());
            snapshotWorkP.start(task).catch((err) => {
                console.log(err);
            });
            break;
        case "intel":
            const intelWorkP  = new IntelWork(
                alfred,
                docId,
                tenantId,
                host,
                config,
                api.getDefaultDocumentServiceFactory());
            intelWorkP.start(task).catch((err) => {
                console.log(err);
            });
            break;
        case "spell":
            loadDictionary(config.serverUrl).then(async (dictionary) => {
                const spellWorkP = new SpellcheckerWork(
                    alfred,
                    docId,
                    tenantId,
                    host,
                    config,
                    dictionary,
                    api.getDefaultDocumentServiceFactory(),
                );
                spellWorkP.start(task).catch((err) => {
                    console.log(err);
                });
            }, (err) => {
                debug(err);
            });
            break;
        case "translation":
            const translationWorkP = new TranslationWork(
                alfred,
                docId,
                tenantId,
                host,
                config,
                api.getDefaultDocumentServiceFactory());
            translationWorkP.start(task).catch((err) => {
                    console.log(err);
            });
            break;
        case "chaincode":
            throw new Error(`Not implemented yet: ${task}`);
        default:
            throw new Error(`Unknown task type: ${task}`);
    }
}
