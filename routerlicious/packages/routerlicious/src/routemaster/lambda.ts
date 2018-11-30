import { MessageType } from "@prague/runtime-definitions";
import * as core from "../core";
import { IContext } from "../kafka-service/lambdas";
import { SequencedLambda } from "../kafka-service/sequencedLambda";
import * as utils from "../utils";
import { DocumentManager } from "./documentManager";

export class RouteMasterLambda extends SequencedLambda {
    constructor(private document: DocumentManager, private producer: utils.IProducer, context: IContext) {
        super(context);
    }

    protected async handlerCore(rawMessage: utils.IMessage): Promise<void> {
        const boxcar = utils.extractBoxcar(rawMessage);

        const boxcarProcessed = new Array<Promise<void>>();
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
                this.context.checkpoint(rawMessage.offset);
            },
            (error) => {
                this.context.error(error, true);
            });
    }

    private async createFork(message: core.ISequencedOperationMessage): Promise<void> {
        const contents = message.operation.metadata.content as core.IForkOperation;
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

        const maps = new Array<Promise<void>>();
        for (const fork of forks) {
            const routeP = this.routeToDeli(fork, message);
            maps.push(routeP);
        }

        await Promise.all(maps);
    }

    /**
     * Routes the provided messages to deli
     */
    private routeToDeli(forkId: string, message: core.ISequencedOperationMessage): Promise<void> {
        // Create the integration message that sends a sequenced operation from an upstream branch to
        // the downstream branch
        const rawMessage: core.IRawOperationMessage = {
            clientId: null,
            documentId: forkId,
            operation: {
                clientSequenceNumber: -1,
                contents: null,
                metadata: {
                    content: message,
                    split: false,
                },
                referenceSequenceNumber: -1,
                traces: [],
                type: MessageType.Integrate,
            },
            tenantId: message.tenantId,
            timestamp: Date.now(),
            type: core.RawOperationType,
            user: null,
        };

        return this.producer.send(JSON.stringify(rawMessage), message.tenantId, forkId);
    }
}
