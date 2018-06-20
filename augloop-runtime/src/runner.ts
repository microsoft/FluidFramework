import { IDocumentServiceFactory } from "@prague/routerlicious/dist/agent";
import { IDocumentService, IQueueMessage } from "@prague/routerlicious/dist/api-core";
import { Deferred } from "@prague/routerlicious/dist/core-utils";
import { IMessage, IMessageReceiver } from "@prague/routerlicious/dist/paparazzi/messages";
import * as socketStorage from "@prague/routerlicious/dist/socket-storage";
import * as utils from "@prague/routerlicious/dist/utils";
import * as winston from "winston";
import { WorkerService } from "./workerService";

class DocumentServiceFactory implements IDocumentServiceFactory {
    constructor(private serverUrl: string, private historianUrl: string) {
    }

    public async getService(tenantId: string): Promise<IDocumentService> {
        // Disable browser error tracking for paparazzi.
        const services = socketStorage.createDocumentService(this.serverUrl, this.historianUrl, tenantId, false);
        return services;
    }
}

export class AugLoopRunner implements utils.IRunner {
    private workerService: WorkerService;
    private running = new Deferred<void>();
    private permission: Set<string>;

    constructor(private workerConfig: any, private messageReceiver: IMessageReceiver) {
        this.permission = new Set(workerConfig.permission as string[]);
        const alfredUrl = workerConfig.alfredUrl;

        const factory = new DocumentServiceFactory(alfredUrl, workerConfig.blobStorageUrl);

        this.workerService = new WorkerService(factory, this.workerConfig);

        // Report any service error.
        this.workerService.on("error", (error) => {
            winston.error(error);
        });
    }

    public async start(): Promise<void> {
        // Preps message receiver.
        await this.messageReceiver.initialize().catch((err) => {
            this.running.reject(err);
        });
        this.messageReceiver.on("error", (err) => {
            this.running.reject(err);
        });
        this.messageReceiver.on("message", (message: IMessage) => {
            const type = message.type;
            if (type === "tasks:start") {
                const requestMessage = message.content as IQueueMessage;
                this.startDocumentWork(requestMessage);
            }
        });

        return this.running.promise;
    }

    public stop(): Promise<void> {
        return this.running.promise;
    }

    private startDocumentWork(requestMsg: IQueueMessage) {
        // Only start tasks that are allowed to run.
        const filteredTask = requestMsg.message.tasks.filter((task) => this.permission.has(task));

        if (filteredTask.length > 0) {
            winston.info(`Starting ${JSON.stringify(filteredTask)}: ${requestMsg.tenantId}/${requestMsg.documentId}`);
            this.workerService.startTasks(
                requestMsg.tenantId,
                requestMsg.documentId,
                filteredTask,
                requestMsg.token).catch((err) => {
                    winston.error(
                        // tslint:disable-next-line
                        `Error starting ${JSON.stringify(filteredTask)}: ${requestMsg.tenantId}/${requestMsg.documentId}: ${err}`
                    );
                });
        }
    }
}
