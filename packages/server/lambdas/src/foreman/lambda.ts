/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { RateLimiter } from "@microsoft/fluid-core-utils";
import { ISequencedDocumentSystemMessage, MessageType, ScopeType } from "@microsoft/fluid-protocol-definitions";
import { IHelpMessage, IQueueMessage } from "@microsoft/fluid-runtime-definitions";
import * as core from "@microsoft/fluid-server-services-core";
import * as winston from "winston";
import { SequencedLambda } from "../sequencedLambda";

// TODO: Move this to config.
const RequestWindowMS = 15000;

export class ForemanLambda extends SequencedLambda {
    private taskQueueMap = new Map<string, string>();
    private rateLimiter = new RateLimiter(RequestWindowMS);
    constructor(
        private messageSender: core.ITaskMessageSender,
        private tenantManager: core.ITenantManager,
        private permissions: any,
        protected context: core.IContext,
        protected tenantId: string,
        protected documentId: string) {
        super(context);
        // Make a map of every task and their intended queue.
        // tslint:disable-next-line:forin
        for (const queueName in this.permissions) {
            for (const task of this.permissions[queueName]) {
                this.taskQueueMap.set(task, queueName);
            }
        }
    }

    protected async handlerCore(message: core.IKafkaMessage): Promise<void> {
        const boxcar = core.extractBoxcar(message);

        for (const baseMessage of boxcar.contents) {
            if (baseMessage.type === core.SequencedOperationType) {
                const sequencedMessage = baseMessage as core.ISequencedOperationMessage;
                // Only process "Help" messages.
                if (sequencedMessage.operation.type === MessageType.RemoteHelp) {
                    let helpContent: string[];
                    // tslint:disable max-line-length
                    const helpMessage: IHelpMessage = JSON.parse((sequencedMessage.operation as ISequencedDocumentSystemMessage).data);
                    // back-compat to play well with older client.
                    if (helpMessage.version) {
                        helpContent = helpMessage.tasks.map((task: string) => `chain-${task}`);
                    } else {
                        helpContent = helpMessage.tasks;
                    }

                    await this.trackDocument(
                        sequencedMessage.operation.clientId,
                        sequencedMessage.tenantId,
                        sequencedMessage.documentId,
                        helpContent);
                }
            }
        }

        this.context.checkpoint(message.offset);
    }

    // Sends help message for a task. Uses a rate limiter to limit request per clientId.
    private async trackDocument(
        clientId: string,
        tenantId: string,
        docId: string,
        helpTasks: string[]): Promise<void> {
        const key = await this.tenantManager.getKey(tenantId);
        const queueTasks = this.generateQueueTasks(helpTasks);
        for (const queueTask of queueTasks) {
            const queueName = queueTask[0];
            const tasks = this.rateLimiter.filter(clientId, queueTask[1]);
            if (tasks.length > 0) {
                const scopes = [ScopeType.DocRead, ScopeType.DocWrite, ScopeType.SummaryWrite];
                const queueMessage: IQueueMessage = {
                    documentId: docId,
                    message: {
                        tasks,
                    },
                    tenantId,
                    token: core.generateToken(tenantId, docId, key, scopes),
                };
                this.messageSender.sendTask(
                    queueName,
                    {
                        content: queueMessage,
                        type: "tasks:start",
                    },
                );
                winston.info(`Request to ${queueName}: ${tenantId}/${docId}/${clientId}:${JSON.stringify(tasks)}`);
            }
        }
    }

    // From a list of task requests, figure out the queue for the tasks and return a map of <queue, takss[]>
    private generateQueueTasks(tasks: string[]): Map<string, string[]> {
        // Figure out the queue for each task and populate the map.
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
