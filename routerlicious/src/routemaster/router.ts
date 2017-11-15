import * as async from "async";
import * as winston from "winston";
import * as api from "../api-core";
import * as core from "../core";
import { Deferred } from "../core-utils";
import * as utils from "../utils";

export class DocumentManager {
    public static async Create(
        id: string,
        collection: core.ICollection<core.IDocument>,
        deltas: core.ICollection<core.ISequencedOperationMessage>): Promise<DocumentManager> {

        const document = await collection.findOne({ _id: id });
        return new DocumentManager(document, collection, deltas);
    }

    private activeForks: Set<string>;
    private sequenceNumber: number;

    private constructor(
        private document: core.IDocument,
        private collection: core.ICollection<core.IDocument>,
        private deltas: core.ICollection<core.ISequencedOperationMessage>) {

        const forks = document.forks || [];
        const filtered = forks
            .filter((value) => value.sequenceNumber !== undefined)
            .map((value) => value.id);
        this.activeForks = new Set(filtered);
    }

    /**
     * Returns the IDs for active forks. Which are those whose create fork message has been processed by the
     * route master.
     */
    public getActiveForks(): Set<string> {
        return this.activeForks;
    }

    public async activateFork(id: string, sequenceNumber: number): Promise<void> {
        // Add the fork to the list of active forks
        this.activeForks.add(id);

        // If fork is already active because we are reprocessing a message we can skip this step. But will assert
        // the sequence number is identical
        await this.collection.update(
            {
                "_id": this.document._id,
                "forks.id": id,
            },
            {
                "forks.$.sequenceNumber": sequenceNumber,
            },
            null);
    }

    public async getDeltas(from: number, to: number): Promise<core.ISequencedOperationMessage[]> {
        const finalLength = Math.max(0, to - from - 1);
        let result: core.ISequencedOperationMessage[] = [];
        const deferred = new Deferred<core.ISequencedOperationMessage[]>();

        const pollDeltas = () => {
            const query = {
                "documentId": this.document._id,
                "operation.sequenceNumber": {
                    $gt: from,
                    $lt: to,
                },
            };

            const deltasP = this.deltas.find(query, { "operation.sequenceNumber": 1 });
            deltasP.then(
                (deltas) => {
                    result = result.concat(deltas);
                    if (result.length === finalLength) {
                        deferred.resolve(result);
                    } else {
                        setTimeout(() => pollDeltas(), 100);
                    }
                },
                (error) => {
                    deferred.reject(error);
                });
        };

        // Start polling for the full set of deltas
        pollDeltas();

        return deferred.promise;
    }

    /**
     * Tracks the last forwarded message for the document
     */
    public trackForward(sequenceNumber: number) {
        this.sequenceNumber = sequenceNumber;
    }
}

export class Router {
    private queue: AsyncQueue<core.ISequencedOperationMessage>;
    private documentDetailsP: Promise<DocumentManager>;

    constructor(
        id: string,
        collection: core.ICollection<core.IDocument>,
        deltas: core.ICollection<any>,
        private producer: utils.kafkaProducer.IProducer) {

        this.documentDetailsP = DocumentManager.Create(id, collection, deltas);
        this.queue = async.queue<core.ISequencedOperationMessage, any>(
            (message, callback) => {
                this.routeCore(message).then(
                    () => {
                        callback();
                    },
                    (error) => {
                        callback(error);
                    });
            },
            1);

        this.queue.error = (error, task) => {
            winston.error("Router error", error);
        };
    }

    /**
     * Routes the provided message
     */
    public route(message: core.ISequencedOperationMessage) {
        this.queue.push(message);
    }

    /**
     * Callback invoked to process a message
     */
    private async routeCore(message: core.ISequencedOperationMessage): Promise<void> {
        // Create the fork first then route any messages. This will make the fork creation the first message
        // routed to the fork. We only process the fork on the route branch it is defined.
        if (!message.origin && message.operation.type === api.Fork) {
            await this.createFork(message);
        }

        return this.routeToForks(message);
    }

    private async createFork(message: core.ISequencedOperationMessage): Promise<void> {
        const contents = message.operation.contents as core.IForkOperation;
        const forkId = contents.name;
        console.log(forkId);

        const document = await this.documentDetailsP;
        const forkSequenceNumber = message.operation.sequenceNumber;

        // If the fork is already active return early - retry logic could have caused a second fork message to be
        // inserted or we may be replaying the delta stream after an error
        if (document.getActiveForks().has(forkId)) {
            return;
        }

        // Forward all deltas greater than contents.sequenceNumber but less than forkSequenceNumber
        // to the fork. All messages after this will be automatically forwarded.
        const deltas = await document.getDeltas(contents.sequenceNumber, forkSequenceNumber);
        console.log(`Retrieved ${deltas.length} deltas`);
        for (const delta of deltas) {
            console.log(`Routing ${delta.operation}`);
            this.routeToDeli(forkId, delta);
        }

        // Activating the fork will complete the operation
        await document.activateFork(forkId, forkSequenceNumber);
    }

    /**
     * Routes the provided message to all active forks
     */
    private async routeToForks(message: core.ISequencedOperationMessage): Promise<void> {
        const document = await this.documentDetailsP;
        const forks = document.getActiveForks();

        for (const fork of forks) {
            this.routeToDeli(fork, message);
        }

        document.trackForward(message.operation.sequenceNumber);
    }

    /**
     * Routes the provided messages to deli
     */
    private routeToDeli(fork: string, message: core.ISequencedOperationMessage) {
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

        // TODO handle the output of this promise and update any errors, etc...
        this.producer.send(JSON.stringify(rawMessage), fork);
    }
}
