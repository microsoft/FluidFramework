/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { RateLimiter } from "@fluidframework/common-utils";
import {
    IHelpMessage,
    IQueueMessage,
    ISequencedDocumentSystemMessage,
    MessageType,
    ScopeType,
} from "@fluidframework/protocol-definitions";
import * as core from "@fluidframework/server-services-core";
import { Lumberjack, BaseTelemetryProperties } from "@fluidframework/server-services-telemetry";

// TODO: Move this to config.
const RequestWindowMS = 15000;

export class ForemanLambda implements core.IPartitionLambda {
    private readonly taskQueueMap = new Map<string, string>();
    private readonly rateLimiter = new RateLimiter(RequestWindowMS);

    constructor(
        private readonly messageSender: core.ITaskMessageSender,
        private readonly tenantManager: core.ITenantManager,
        private readonly tokenGenerator: core.TokenGenerator,
        private readonly permissions: any,
        protected context: core.IContext,
        protected tenantId: string,
        protected documentId: string) {
        // Make a map of every task and their intended queue.
        // eslint-disable-next-line guard-for-in, no-restricted-syntax
        for (const queueName in this.permissions) {
            for (const task of this.permissions[queueName]) {
                this.taskQueueMap.set(task, queueName);
            }
        }
    }

    public close() {
    }

    public async handler(message: core.IQueuedMessage) {
        const boxcar = core.extractBoxcar(message);

        for (const baseMessage of boxcar.contents) {
            if (baseMessage.type === core.SequencedOperationType) {
                const sequencedMessage = baseMessage as core.ISequencedOperationMessage;
                // Only process "Help" messages.
                if (sequencedMessage.operation.type === MessageType.RemoteHelp) {
                    // eslint-disable-next-line max-len
                    const helpMessage: IHelpMessage = JSON.parse((sequencedMessage.operation as ISequencedDocumentSystemMessage).data);
                    // Back-compat to play well with older client.
                    const helpContent = helpMessage.version
                        ? helpMessage.tasks.map((task: string) => `chain-${task}`)
                        : helpMessage.tasks;

                    await this.trackDocument(
                        sequencedMessage.operation.clientId,
                        sequencedMessage.tenantId,
                        sequencedMessage.documentId,
                        helpContent);
                }
            }
        }

        this.context.checkpoint(message);
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

                    token: this.tokenGenerator(tenantId, docId, key, scopes),
                };
                this.messageSender.sendTask(
                    queueName,
                    {
                        content: queueMessage,
                        type: "tasks:start",
                    },
                );
                this.context.log?.info(
                    `Request to ${queueName}: ${clientId}:${JSON.stringify(tasks)}`,
                    {
                        messageMetaData: {
                            documentId: docId,
                            tenantId,
                        },
                    });
                Lumberjack.info(`Request to ${queueName}: ${clientId}:${JSON.stringify(tasks)}`,
                    {
                        [BaseTelemetryProperties.tenantId]: tenantId,
                        [BaseTelemetryProperties.documentId]: docId,
                    });
            }
        }
    }

    // From a list of task requests, figure out the queue for the tasks and return a map of <queue, takss[]>
    private generateQueueTasks(tasks: string[]): Map<string, string[]> {
        // Figure out the queue for each task and populate the map.
        const queueTaskMap = new Map<string, string[]>();
        for (const task of tasks) {
            const queue = this.taskQueueMap.get(task);
            if (queue) {
                let queueTasks = queueTaskMap.get(queue);
                if (!queueTasks) {
                    queueTasks = [];
                    queueTaskMap.set(queue, queueTasks);
                }
                queueTasks.push(task);
            }
        }
        return queueTaskMap;
    }
}
