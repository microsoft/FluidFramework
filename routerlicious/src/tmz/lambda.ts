import * as winston from "winston";
import { IHelpMessage, IQueueMessage, RemoteHelp } from "../api-core";
import * as core from "../core";
import { IContext } from "../kafka-service/lambdas";
import { SequencedLambda } from "../kafka-service/sequencedLambda";
import * as utils from "../utils";

export class TmzLambda extends SequencedLambda {
    private taskQueueMap = new Map<string, string>();
    private requestMap = new Map<string, Set<string>>();
    constructor(
        private messageSender: core.ITaskMessageSender,
        private tenantManager: core.ITenantManager,
        private permissions: any,
        protected context: IContext) {
        super(context);
        // Make a map of every task and their intended queue.
        // tslint:disable-next-line:forin
        for (const queueName in this.permissions) {
            for (const task of this.permissions[queueName]) {
                this.taskQueueMap.set(task, queueName);
            }
        }
    }

    protected async handlerCore(message: utils.IMessage): Promise<void> {
        const baseMessage = JSON.parse(message.value.toString()) as core.IMessage;
        if (baseMessage.type === core.SequencedOperationType) {
            const sequencedMessage = baseMessage as core.ISequencedOperationMessage;
            // Only process "Help" messages.
            if (sequencedMessage.operation.type === RemoteHelp) {
                await this.trackDocument(
                    sequencedMessage.operation.clientId,
                    sequencedMessage.tenantId,
                    sequencedMessage.documentId,
                    sequencedMessage.operation.contents);
            }
        }
        this.context.checkpoint(message.offset);
    }

    // To make sure that there is only one request per document-client-task, keeps track of already requested taks
    // for a document-client.
    private async trackDocument(
        clientId: string,
        tenantId: string,
        docId: string,
        message: IHelpMessage): Promise<void> {
        const key = await this.tenantManager.getKey(tenantId);

        const fullId = `${tenantId}/${docId}/${clientId}`;
        const filteredTasks = this.filterTasks(fullId, message.tasks);
        for (const queueTask of filteredTasks) {
            const queueName = queueTask[0];
            const tasks = queueTask[1];
            if (tasks.length > 0) {
                const queueMessage: IQueueMessage = {
                    documentId: docId,
                    message: {
                        tasks,
                    },
                    tenantId,
                    token: utils.generateToken(tenantId, docId, key),
                };
                this.messageSender.sendTask(
                    queueName,
                    {
                        content: queueMessage,
                        type: "tasks:start",
                    },
                );
                winston.info(`Request to ${queueName}: ${fullId}:${JSON.stringify(tasks)}`);
            }
        }
    }

    // From a list of task requests, find the unrequested tasks for this document-clientid.
    // Figure out the queue for the tasks and return a map of <queue, takss[]>.
    // Also update the request map.
    private filterTasks(fullId: string, tasks: string[]): Map<string, string[]> {
        // FIlter out the unrequested tasks.
        const requestedTasks = this.requestMap.has(fullId) ? this.requestMap.get(fullId) : new Set<string>();
        const newTasks = tasks.filter((task) => !requestedTasks.has(task));

        // Figure out the queue for each task and populate the map.
        const queueTaskMap = new Map<string, string[]>();
        for (const task of newTasks) {
            if (this.taskQueueMap.has(task)) {
                const queue = this.taskQueueMap.get(task);
                if (!queueTaskMap.has(queue)) {
                    queueTaskMap.set(queue, []);
                }
                queueTaskMap.get(queue).push(task);
                this.updateRequestMap(fullId, task);
            }
        }
        return queueTaskMap;
    }

    private updateRequestMap(fullId: string, task: string) {
        if (!this.requestMap.has(fullId)) {
            this.requestMap.set(fullId, new Set<string>());
        }
        this.requestMap.get(fullId).add(task);
    }
}
