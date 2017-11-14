import * as async from "async";
import * as winston from "winston";
import * as api from "../api-core";
import * as core from "../core";
import * as utils from "../utils";

export class DocumentManager {
    public static async Create(
        id: string,
        collection: core.ICollection<core.IDocument>,
        deltas: core.ICollection<any>): Promise<DocumentManager> {

        const document = await collection.findOne({ _id: id });
        return new DocumentManager(document, collection, deltas);
    }

    private activeForks: Set<string>;

    private constructor(
        private document: core.IDocument,
        private collection: core.ICollection<core.IDocument>,
        private deltas: core.ICollection<any>) {

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

    public async getDeltas(to: number): Promise<core.ISequencedOperationMessage[]> {
        // TODO we are racing scriptorium here for packets since both are processing the delta stream. But
        // the below is just a temp until we can encode enough details so the API can load off of the parent
        // branch snapshot + deltas before switching to the branch flow

        const query = {
            "documentId": this.document._id,
            "operation.sequenceNumber": {
                $lt: to,
            },
        };

        const dbDeltas = await this.deltas.find(query, { "operation.sequenceNumber": 1 });
        return dbDeltas;
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
        // routed to the fork
        if (message.operation.type === api.Fork) {
            await this.createFork(message);
        }

        return this.routeToForks(message);
    }

    private async createFork(message: core.ISequencedOperationMessage): Promise<void> {
        winston.info(`Received Fork message`);
        const forkId = message.operation.contents;
        console.log(forkId);

        const document = await this.documentDetailsP;
        const forkSequenceNumber = message.operation.sequenceNumber;

        // If the fork is already active return early - retry logic could have caused a second fork message to be
        // inserted or we may be replaying the delta stream after an error
        if (document.getActiveForks().has(forkId)) {
            return;
        }

        // TODO what do I want to do here - I stored this sequence number in the branch table
        // Load all deltas from the current document up to forkSequenceNumber and forward them
        // to the forked document
        // Create an optional filter to restrict the delta range
        // const deltas = await document.getDeltas(forkSequenceNumber);
        // console.log(`Retrieved ${deltas.length} deltas`);
        // for (const delta of deltas) {
        //     console.log(`Routing ${delta.operation}`);
        //     this.routeToDeli(forkId, delta);
        // }

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
    }

    /**
     * Routes the provided messages to deli
     */
    private routeToDeli(fork: string, message: core.ISequencedOperationMessage) {
        winston.info(`Routing ${message.documentId}@${message.operation.sequenceNumber} to ${fork}`);

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
