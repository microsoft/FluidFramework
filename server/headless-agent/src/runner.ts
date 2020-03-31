/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Deferred } from "@microsoft/fluid-core-utils";
import { IQueueMessage } from "@microsoft/fluid-protocol-definitions";
import * as core from "@microsoft/fluid-server-services-core";
import * as utils from "@microsoft/fluid-server-services-utils";
import * as winston from "winston";
import { ICloseEvent, PuppetMaster } from "./puppeteer";
import { ICache } from "./redisCache";
import { ISearchStorage } from "./searchStorage";

export class HeadlessRunner implements utils.IRunner {
    private running = new Deferred<void>();
    private permission: Set<string>;
    private puppetCache = new Map<string, PuppetMaster>();

    constructor(
        private workerConfig: any,
        private messageReceiver: core.ITaskMessageReceiver,
        private searchStorage: ISearchStorage,
        private cache: ICache) {
        this.permission = new Set(workerConfig.permission as string[]);
    }

    public async start(): Promise<void> {
        // Preps message receiver and agent uploader.
        const messageReceiverP = this.messageReceiver.initialize();
        await Promise.all([messageReceiverP]).catch((err) => {
            this.running.reject(err);
        });

        // Should reject on message receiver error.
        this.messageReceiver.on("error", (err) => {
            this.running.reject(err);
        });

        // Accept a task.
        this.messageReceiver.on("message", (message: core.ITaskMessage) => {
            const type = message.type;

            if (type === "tasks:start") {
                winston.info("tasks:start!!!");
                const requestMessage = message.content as IQueueMessage;
                const originalTasksToRun = requestMessage.message.tasks.filter((task) => this.permission.has(task));
                // back-compat with tmz
                const tasksToRun = originalTasksToRun.map((task: string) => {
                    if (task.startsWith("chain-")) {
                        return task.substr(6);
                    } else {
                        return task;
                    }
                });
                for (const task of tasksToRun) {
                    this.launchPuppetMaster(requestMessage, task);
                }
            }
        });

        return this.running.promise;
    }

    public async stop(): Promise<void> {
        await this.messageReceiver.close();
        return this.running.promise;
    }

    private launchPuppetMaster(requestMessage: IQueueMessage, task: string) {
        PuppetMaster.create(
            requestMessage.documentId,
            requestMessage.tenantId,
            this.workerConfig.internalGatewayUrl,
            task,
            this.workerConfig.key,
            this.searchStorage,
            this.cache)
            .then((puppet) => {

                puppet.launch().then(() => {
                    const cacheKey = this.createKey(
                        requestMessage.tenantId,
                        requestMessage.documentId,
                        task);

                    this.puppetCache.set(cacheKey, puppet);
                    winston.info(`Launched for ${cacheKey}`);
                    puppet.on("close", (ev: ICloseEvent) => {
                        this.closePuppet(ev);
                        winston.info(`Closed for ${cacheKey}`);
                    });
                }, (err) => {
                    winston.error(err);
                });
            });
    }

    private closePuppet(ev: ICloseEvent) {
        const cacheKey = this.createKey(ev.tenantId, ev.documentId, ev.task);
        if (this.puppetCache.has(cacheKey)) {
            this.puppetCache.delete(cacheKey);
        }
    }

    private createKey(tenantId: string, documentId: string, task: string) {
        return `${tenantId}/${documentId}/${task}`;
    }
}
