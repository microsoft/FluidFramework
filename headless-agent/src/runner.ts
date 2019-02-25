import { IQueueMessage } from "@prague/runtime-definitions";
import * as core from "@prague/services-core";
import * as utils from "@prague/services-utils";
import { Deferred } from "@prague/utils";
import * as winston from "winston";

export class HeadlessRunner implements utils.IRunner {
    private running = new Deferred<void>();

    constructor(
        private workerConfig: any,
        private messageReceiver: core.ITaskMessageReceiver) {
        const alfredUrl = workerConfig.alfredUrl;
        winston.info(`Alfred URL: ${alfredUrl}`);
        winston.info(`Worker congif: ${JSON.stringify(this.workerConfig)}`);
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
                winston.info(`Message received: ${JSON.stringify(requestMessage)}`);
            }
        });

        return this.running.promise;
    }

    public stop(): Promise<void> {
        return this.running.promise;
    }
}
