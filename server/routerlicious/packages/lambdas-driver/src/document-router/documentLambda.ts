/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    extractBoxcar,
    IContext,
    IQueuedMessage,
    IPartitionLambda,
    IPartitionLambdaFactory,
    LambdaCloseType,
    IContextErrorData,
} from "@fluidframework/server-services-core";
import { Provider } from "nconf";
import { DocumentContextManager } from "./contextManager";
import { DocumentPartition } from "./documentPartition";

// Expire document partitions after 10 minutes of no activity
const PartitionActivityTimeout = 10 * 60 * 1000;

// How often to check the partitions for inacitivty
const PartitionActivityCheckInterval = 60 * 1000;

export class DocumentLambda implements IPartitionLambda {
    private readonly documents = new Map<string, DocumentPartition>();
    private readonly contextManager: DocumentContextManager;

    private activityCheckTimer: NodeJS.Timeout | undefined;

    constructor(
        private readonly factory: IPartitionLambdaFactory,
        private readonly config: Provider,
        context: IContext,
        private readonly partitionActivityTimeout = PartitionActivityTimeout,
        partitionActivityCheckInterval = PartitionActivityCheckInterval) {
        this.contextManager = new DocumentContextManager(context);
        this.contextManager.on("error", (error, errorData: IContextErrorData) => {
            context.error(error, errorData);
        });
        this.activityCheckTimer = setInterval(this.inactivityCheck.bind(this), partitionActivityCheckInterval);
    }

    public handler(message: IQueuedMessage): void {
        this.contextManager.setHead(message);
        this.handlerCore(message);
        this.contextManager.setTail(message);
    }

    public close(closeType: LambdaCloseType) {
        if (this.activityCheckTimer !== undefined) {
            clearInterval(this.activityCheckTimer);
            this.activityCheckTimer = undefined;
        }

        this.contextManager.close();

        for (const [, partition] of this.documents) {
            partition.close(closeType);
        }

        this.documents.clear();
    }

    private handlerCore(message: IQueuedMessage): void {
        const boxcar = extractBoxcar(message);
        if (!boxcar.documentId || !boxcar.tenantId) {
            return;
        }

        // Stash the parsed value for down stream lambdas
        message.value = boxcar;

        // Create the routing key from tenantId + documentId
        const routingKey = `${boxcar.tenantId}/${boxcar.documentId}`;

        // Create or update the DocumentPartition
        let document: DocumentPartition;
        if (!this.documents.has(routingKey)) {
            // Create a new context and begin tracking it
            const documentContext = this.contextManager.createContext(message);

            document = new DocumentPartition(
                this.factory,
                this.config,
                boxcar.tenantId,
                boxcar.documentId,
                documentContext,
                this.partitionActivityTimeout);
            this.documents.set(routingKey, document);
        } else {
            document = this.documents.get(routingKey);
            // SetHead assumes it will always receive increasing offsets. So we need to split the creation case
            // from the update case.
            document.context.setHead(message);
        }

        // Forward the message to the document queue and then resolve the promise to begin processing more messages
        document.process(message);
    }

    /**
     * Closes inactive documents
     */
    private inactivityCheck() {
        const now = Date.now();

        const documentPartitions = Array.from(this.documents);
        for (const [routingKey, documentPartition] of documentPartitions) {
            if (documentPartition.isInactive(now)) {
                // Close and remove the inactive document
                documentPartition.close(LambdaCloseType.ActivityTimeout);
                this.documents.delete(routingKey);
            }
        }
    }
}
