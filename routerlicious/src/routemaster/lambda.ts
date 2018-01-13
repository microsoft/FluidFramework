import * as assert from "assert";
import * as api from "../api-core";
import * as core from "../core";
import { IContext, IPartitionLambda } from "../kafka-service/lambdas";
import * as utils from "../utils";
import { DocumentManager } from "./documentManager";

export class RouteMasterLambda implements IPartitionLambda {
    constructor(
        private document: DocumentManager,
        private producer: utils.kafkaProducer.IProducer,
        private context: IContext) {
    }

    public handler(rawMessage: utils.kafkaConsumer.IMessage): void {
        const message = JSON.parse(rawMessage.value) as core.ISequencedOperationMessage;
        assert(message.type === core.SequencedOperationType);

        this.handlerCore(message);

        // TODO this needs to be resolved with other work
        this.context.checkpoint(rawMessage.offset);
    }

    private handlerCore(message: core.ISequencedOperationMessage): void {
        // Create the fork first then route any messages. This will make the fork creation the first message
        // routed to the fork. We only process the fork on the route branch it is defined.
        if (!message.operation.origin && message.operation.type === api.Fork) {
            return this.createFork(message);
        } else {
            return this.routeToForks(message);
        }
    }

    private createFork(message: core.ISequencedOperationMessage): void {
        const contents = message.operation.contents as core.IForkOperation;
        const forkId = contents.name;
        const forkSequenceNumber = message.operation.sequenceNumber;

        // If the fork is already active return early - retry logic could have caused a second fork message to be
        // inserted or we may be replaying the delta stream after an error
        if (this.document.getActiveForks().has(forkId)) {
            return;
        }

        // Forward all deltas greater than contents.sequenceNumber but less than forkSequenceNumber
        // to the fork. All messages after this will be automatically forwarded.
        const deltas = await this.document.getDeltas(contents.sequenceNumber, forkSequenceNumber);
        for (const delta of deltas) {
            this.routeToDeli(forkId, delta);
        }

        // Activating the fork will complete the operation
        await this.document.activateFork(forkId, forkSequenceNumber);
    }

    /**
     * Routes the provided message to all active forks
     */
    private routeToForks(message: core.ISequencedOperationMessage): void {
        const document = this.document;
        const forks = document.getActiveForks();

        let maps = new Array<Promise<void>>();
        for (const fork of forks) {
            const routeP = this.routeToDeli(fork, message);
            maps.push(routeP);
        }

        // TODO can checkpoint here
        Promise.all(maps).then(
            () => {
            },
            (error) => {
            });
    }

    /**
     * Routes the provided messages to deli
     */
    private routeToDeli(fork: string, message: core.ISequencedOperationMessage): Promise<void> {
        // Create the integration message that sends a sequenced operation from an upstream branch to
        // the downstream branch
        const rawMessage: core.IRawOperationMessage = {
            clientId: null,
            documentId: fork,
            operation: {
                clientSequenceNumber: -1,
                contents: message,
                encrypted: false,
                encryptedContents: null,
                referenceSequenceNumber: -1,
                traces: [],
                type: api.Integrate,
            },
            timestamp: Date.now(),
            type: core.RawOperationType,
            userId: null,
        };

        return this.producer.send(JSON.stringify(rawMessage), fork);
    }
}
