import { IDocumentServiceFactory, IDocumentTaskInfo } from "@prague/routerlicious/dist/agent";
import { IDocumentService, IQueueMessage } from "@prague/routerlicious/dist/api-core";
import * as core from "@prague/routerlicious/dist/core";
import { Deferred } from "@prague/routerlicious/dist/core-utils";
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

    constructor(private workerConfig: any, private messageReceiver: core.ITaskMessageReceiver) {
        this.permission = new Set(workerConfig.permission as string[]);
        const alfredUrl = workerConfig.alfredUrl;

        const factory = new DocumentServiceFactory(alfredUrl, workerConfig.blobStorageUrl);

        this.workerService = new WorkerService(factory, this.workerConfig);
    }

    public async start(): Promise<void> {
        // Preps message receiver.
        await this.messageReceiver.initialize().catch((err) => {
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
                this.startDocumentWork(requestMessage);
            }
        });

        // Listen and respond to stop events.
        this.workerService.on("stop", (ev: IDocumentTaskInfo) => {
            this.workerService.stopTask(ev.tenantId, ev.docId, ev.task);
        });

        // Report any error while working on the document.
        this.workerService.on("error", (error) => {
            winston.error(error);
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
