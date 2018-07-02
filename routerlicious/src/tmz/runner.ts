import * as winston from "winston";
import { IHelpMessage, IQueueMessage } from "../api-core";
import { ITenantManager } from "../core";
import { Deferred } from "../core-utils";
import * as utils from "../utils";
import * as messages from "./messages";

export class TmzRunner implements utils.IRunner {
    private deferred = new Deferred<void>();
    private taskQueueMap = new Map<string, string>();
    private requestMap = new Map<string, string>();

    constructor(
        alfredUrl: string,
        private agentUploader: messages.IAgentUploader,
        private messageSender: messages.IMessageSender,
        private tenantManager: ITenantManager,
        private permissions: any) {
    }

    public async start(): Promise<void> {
        // tslint:disable-next-line:forin
        for (const queueName in this.permissions) {
            for (const task of this.permissions[queueName]) {
                this.taskQueueMap.set(task, queueName);
            }
        }

        // Preps message sender.
        await this.messageSender.initialize().catch((err) => {
            this.deferred.reject(err);
        });
        this.messageSender.on("error", (err) => {
            this.deferred.reject(err);
        });

        // Preps and start listening to agent uploader.
        this.agentUploader.initialize();
        this.agentUploader.on("agentAdded", (agent: messages.IAgent) => {
            if (agent.type === "server") {
                winston.info(`New agent package uploaded: ${agent.name}`);

                // Converting to webpacked scripts is disabled for now. Need to figure out an way to do it only once.
                // const moduleUrl = url.resolve(this.alfredUrl, `/agent/js/${agent.name}`);
                // request.post(moduleUrl);

                // Publishes to exchange.
                this.messageSender.sendAgent({
                    content: agent.name,
                    type: "agent:add",
                });
            } else if (agent.type === "client") {
                winston.info(`New agent script uploaded: ${agent.name}`);
                // TODO: Figure out an way to send this message to browser clients.
            }
        });
        this.agentUploader.on("agentRemoved", (agent: messages.IAgent) => {
            if (agent.type === "server") {
                winston.info(`Agent package removed: ${agent.name}`);
                this.messageSender.sendAgent({
                    content: agent.name,
                    type: "agent:remove",
                });
            } else if (agent.type === "client") {
                winston.info(`Agent script removed`);
                // TODO: Figure out an way to send this message to browser clients.
            }
        });
        this.agentUploader.on("error", (err) => {
            // Do not reject on minio error since its not critical. Just report the error.
            winston.error(err);
        });

        return this.deferred.promise;
    }

    public stop(): Promise<void> {
        winston.info("Stop requested");
        return this.deferred.promise;
    }

    public async trackDocument(tenantId: string, docId: string, message: IHelpMessage): Promise<void> {
        const fullId = `${tenantId}/${docId}`;
        if (this.requestMap.has(fullId) && this.requestMap.get(fullId) === message.clientId) {
            return;
        } else {
            this.requestMap.set(fullId, message.clientId);
            const key = await this.tenantManager.getKey(tenantId);
            const queueTaskMap = this.generateQueueTaskMap(message.tasks);
            for (const queueTask of queueTaskMap) {
                if (queueTask[1].length > 0) {
                    const queueMessage: IQueueMessage = {
                        documentId: docId,
                        message: {
                            clientId: message.clientId,
                            tasks: queueTask[1],
                        },
                        tenantId,
                        token: utils.generateToken(tenantId, docId, key),
                    };
                    this.messageSender.sendTask(
                        queueTask[0],
                        {
                            content: queueMessage,
                            type: "tasks:start",
                        },
                    );
                    winston.info(`${queueTask[0]}. ${fullId}: ${JSON.stringify(queueMessage.message.tasks)}`);
                }
            }
        }
    }

    private generateQueueTaskMap(tasks: string[]): Map<string, string[]> {
        const queueTaskMap = new Map<string, string[]>();
        for (const task of tasks) {
            if (this.taskQueueMap.has(task)) {
                const queue = this.taskQueueMap.get(task);
                if (!queueTaskMap.has(queue)) {
                    queueTaskMap.set(queue, []);
                }
                queueTaskMap.get(queue).push(task);
            }
        }
        return queueTaskMap;
    }
}
