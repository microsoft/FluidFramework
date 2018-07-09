import * as winston from "winston";
import { IHelpMessage, IQueueMessage, RemoteHelp } from "../api-core";
import * as core from "../core";
import { IContext } from "../kafka-service/lambdas";
import { SequencedLambda } from "../kafka-service/sequencedLambda";
import * as services from "../services";
import * as utils from "../utils";

export class TmzLambda extends SequencedLambda {
    private taskQueueMap = new Map<string, string>();
    private requestMap = new Map<string, string>();
    constructor(
        private messageSender: core.IMessageSender,
        private tenantManager: services.TenantManager,
        private permissions: any,
        protected context: IContext) {
        super(context);
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
                    sequencedMessage.tenantId,
                    sequencedMessage.documentId,
                    sequencedMessage.operation.contents);
            }
        }
        this.context.checkpoint(message.offset);
    }

    private async trackDocument(tenantId: string, docId: string, message: IHelpMessage): Promise<void> {
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
