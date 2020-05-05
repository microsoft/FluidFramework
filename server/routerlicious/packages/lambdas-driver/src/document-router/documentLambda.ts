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
} from "@microsoft/fluid-server-services-core";
import { Provider } from "nconf";
import { DocumentContextManager } from "./contextManager";
import { DocumentPartition } from "./documentPartition";

// Expire document partitions after 10 minutes of no activity
const ActivityTimeout = 10 * 60 * 1000;

export class DocumentLambda implements IPartitionLambda {
    private readonly documents = new Map<string, DocumentPartition>();
    private readonly contextManager: DocumentContextManager;

    constructor(
        private readonly factory: IPartitionLambdaFactory,
        private readonly config: Provider,
        context: IContext,
        private readonly activityTimeout = ActivityTimeout) {
        this.contextManager = new DocumentContextManager(context);
        this.contextManager.on("error", (error, restart) => {
            context.error(error, restart);
        });
    }

    public handler(message: IQueuedMessage): void {
        this.contextManager.setHead(message);
        this.handlerCore(message);
        this.contextManager.setTail(message);
    }

    public close() {
        this.contextManager.close();

        for (const [, partition] of this.documents) {
            partition.close();
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
                this.activityTimeout);
            document.on("inactive", () => {
                // Close and remove the inactive document
                document.close();
                this.documents.delete(routingKey);
            });

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
}
