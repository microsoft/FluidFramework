import { IQueueMessage } from "@prague/runtime-definitions";
import * as core from "@prague/services-core";
import * as utils from "@prague/services-utils";
import { Deferred } from "@prague/utils";
import * as winston from "winston";
import { PuppetMaster } from "./puppeteer";
import { ICache } from "./redisCache";

export class HeadlessRunner implements utils.IRunner {
    private running = new Deferred<void>();

    constructor(
        private workerConfig: any,
        private messageReceiver: core.ITaskMessageReceiver,
        private cache: ICache) {
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
                const requestMessage = message.content as IQueueMessage;
                winston.info(`Task message received: ${JSON.stringify(requestMessage)}`);
                // For now we only care about snapshot
                const puppetMaster = new PuppetMaster(
                    requestMessage.documentId,
                    this.workerConfig.alfredUrl,
                    this.workerConfig.blobStorageUrl,
                    requestMessage.tenantId,
                    requestMessage.token,
                    this.workerConfig.packageUrl,
                    "snapshot",
                    this.cache);
                puppetMaster.launch().then(() => {
                    winston.info(`Launched for ${requestMessage.tenantId}/${requestMessage.documentId}`);
                }, (err) => {
                    winston.error(err);
                });
            }
        });

        return this.running.promise;
    }

    public async stop(): Promise<void> {
        await this.messageReceiver.close();
        return this.running.promise;
    }
}
