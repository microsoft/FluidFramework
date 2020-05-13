/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IDocumentSystemMessage,
    ISequencedDocumentSystemMessage,
    MessageType,
} from "@microsoft/fluid-protocol-definitions";
import { SequencedLambda } from "@microsoft/fluid-server-lambdas";
import core from "@microsoft/fluid-server-services-core";
import { DocumentManager } from "./documentManager";

export class RouteMasterLambda extends SequencedLambda {
    constructor(
        private readonly document: DocumentManager,
        private readonly producer: core.IProducer,
        context: core.IContext,
        protected tenantId: string,
        protected documentId: string) {
        super(context);
    }

    protected async handlerCore(rawMessage: core.IQueuedMessage): Promise<void> {
        const boxcar = core.extractBoxcar(rawMessage);

        const boxcarProcessed: Promise<void>[] = [];
        for (const message of boxcar.contents) {
            if (message.type === core.SequencedOperationType) {
                const sequencedOpMessage = message as core.ISequencedOperationMessage;
                // Create the fork first then route any messages. This will make the fork creation the first message
                // routed to the fork. We only process the fork on the route branch it is defined.
                if (!sequencedOpMessage.operation.origin && sequencedOpMessage.operation.type === MessageType.Fork) {
                    await this.createFork(sequencedOpMessage);
                }

                // Route the fork message to all clients
                // TODO - routing the message keeps the sequenced messages exact - but should all clients see
                // fork requests on the parent?
                const routeP = this.routeToForks(sequencedOpMessage, rawMessage.offset);
                boxcarProcessed.push(routeP);
            }
        }

        // TODO can checkpoint here
        Promise.all(boxcarProcessed).then(
            () => {
                this.context.checkpoint(rawMessage);
            },
            (error) => {
                this.context.error(error, true);
            });
    }

    private async createFork(message: core.ISequencedOperationMessage): Promise<void> {
        const operation = message.operation as ISequencedDocumentSystemMessage;
        let contents: core.IForkOperation;
        if (operation.data) {
            contents = JSON.parse(operation.data);
        }
        const forkId = contents.documentId;
        const forkSequenceNumber = message.operation.sequenceNumber;

        // If the fork is already active return early - retry logic could have caused a second fork message to be
        // inserted or we may be replaying the delta stream after an error
        if (this.document.getActiveForks().has(forkId)) {
            return;
        }

        // Forward all deltas greater than contents.sequenceNumber but less than forkSequenceNumber
        // to the fork. All messages after this will be automatically forwarded. We wait on the last message
        // to ensure its delivery.
        const deltas = await this.document.getDeltas(contents.sequenceNumber, forkSequenceNumber);
        let routedP = Promise.resolve();
        for (const delta of deltas) {
            routedP = this.routeToDeli(forkId, delta);
        }
        await routedP;

        // Activating the fork will complete the operation
        await this.document.activateFork(forkId, forkSequenceNumber);
    }

    /**
     * Routes the provided message to all active forks
     */
    private async routeToForks(message: core.ISequencedOperationMessage, offset: number): Promise<void> {
        const document = this.document;
        const forks = document.getActiveForks();

        const maps: Promise<void>[] = [];
        for (const fork of forks) {
            const routeP = this.routeToDeli(fork, message);
            maps.push(routeP);
        }

        await Promise.all(maps);
    }

    /**
     * Routes the provided messages to deli
     */
    // eslint-disable-next-line @typescript-eslint/promise-function-async
    private routeToDeli(forkId: string, message: core.ISequencedOperationMessage): Promise<void> {
        // Create the integration message that sends a sequenced operation from an upstream branch to
        // the downstream branch
        const operation: IDocumentSystemMessage = {
            clientSequenceNumber: -1,
            contents: null,
            data: JSON.stringify(message),
            referenceSequenceNumber: -1,
            traces: [],
            type: MessageType.Integrate,
        };
        const rawMessage: core.IRawOperationMessage = {
            clientId: null,
            documentId: forkId,
            operation,
            tenantId: message.tenantId,
            timestamp: Date.now(),
            type: core.RawOperationType,
        };

        return this.producer.send([rawMessage], message.tenantId, forkId);
    }
}
