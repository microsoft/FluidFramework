import * as assert from "assert";
import * as _ from "lodash";
import * as winston from "winston";
import * as agent from "../agent";
import * as api from "../api-core";
import * as core from "../core";
import { RangeTracker, ThroughputCounter } from "../core-utils";
import { IContext, IPartitionLambda } from "../kafka-service/lambdas";
import * as utils from "../utils";
import { CheckpointContext, ICheckpoint, IClientSequenceNumber } from "./checkpointContext";

const SequenceNumberComparer: utils.IComparer<IClientSequenceNumber> = {
    compare: (a, b) => a.referenceSequenceNumber - b.referenceSequenceNumber,
    min: {
        canEvict: true,
        clientId: undefined,
        lastUpdate: -1,
        referenceSequenceNumber: -1,
    },
};

/**
 * Maps from a branch to a clientId stored in the MSN map
 */
function getBranchClientId(branch: string) {
    return `branch$${branch}`;
}

export class DeliLambda implements IPartitionLambda {
    private throughput = new ThroughputCounter(winston.info, "Delta Topic ");
    private sequenceNumber: number = undefined;
    private logOffset: number;

    // Client sequence number mapping
    private clientNodeMap: { [key: string]: utils.IHeapNode<IClientSequenceNumber> } = {};
    private clientSeqNumbers = new utils.Heap<IClientSequenceNumber>(SequenceNumberComparer);
    private minimumSequenceNumber = -1;
    private window: RangeTracker;
    private branchMap: RangeTracker;
    private checkpointContext: CheckpointContext;

    constructor(
        context: IContext,
        private documentId: string,
        dbObject: core.IDocument,
        collection: core.ICollection<core.IDocument>,
        private producer: utils.kafkaProducer.IProducer,
        private clientTimeout: number) {

        // Instantiate existing clients
        if (dbObject.clients) {
            for (const client of dbObject.clients) {
                this.upsertClient(
                    client.clientId,
                    client.referenceSequenceNumber,
                    client.lastUpdate,
                    client.canEvict);
            }
        }

        // Setup branch information
        if (dbObject.parent) {
            if (dbObject.branchMap) {
                this.branchMap = new RangeTracker(dbObject.branchMap);
            } else {
                // Initialize the range tracking window
                this.branchMap = new RangeTracker(
                    dbObject.parent.minimumSequenceNumber,
                    dbObject.parent.minimumSequenceNumber);
                // tslint:disable-next-line:max-line-length
                for (let i = dbObject.parent.minimumSequenceNumber + 1; i <= dbObject.parent.sequenceNumber; i++) {
                    this.branchMap.add(i, i);
                }

                // Add in the client representing the parent
                this.upsertClient(
                    getBranchClientId(dbObject.parent.id),
                    dbObject.parent.minimumSequenceNumber,
                    dbObject.createTime,
                    false);
            }
        }

        // Initialize counting context
        this.sequenceNumber = dbObject.sequenceNumber;
        this.logOffset = dbObject.logOffset;
        this.checkpointContext = new CheckpointContext(documentId, collection, context);
    }

    public handler(message: utils.kafkaConsumer.IMessage): void {
        // Trace for the message.
        const trace: api.ITrace = { service: "deli", action: "start", timestamp: Date.now()};
        this.ticket(message, trace);
    }

    private ticket(rawMessage: utils.kafkaConsumer.IMessage, trace: api.ITrace): void {
        // In cases where we are reprocessing messages we have already checkpointed exit early
        if (rawMessage.offset < this.logOffset) {
            return;
        }

        this.logOffset = rawMessage.offset;

        // Update the client's reference sequence number based on the message type
        const objectMessage = JSON.parse(rawMessage.value.toString()) as core.IObjectMessage;

        // Exit out early for unknown messages
        if (objectMessage.type !== core.RawOperationType) {
            return;
        }

        // Update and retrieve the minimum sequence number
        let message = objectMessage as core.IRawOperationMessage;

        if (message.operation.type !== api.Integrate
            && message.clientId
            && message.operation.referenceSequenceNumber < this.minimumSequenceNumber) {

            // TODO TODO TODO
            // Need to mark this client ID as nack'ed. Now should I also rev an epoch for the client or just make
            // them hand me a new ID - which in some ways is just {name}+{epoch}

            // Add in a placeholder for the nack'ed client
            this.upsertClient(
                message.clientId,
                this.minimumSequenceNumber,
                message.timestamp,
                true);

            // Send the nack message
            const nackMessage: core.INackMessage = {
                documentId: objectMessage.documentId,
                operation: message.operation,
                sequenceNumber: this.minimumSequenceNumber,
                type: core.NackOperationType,
            };

            this.sendMessage(nackMessage);

            return;
        }

        // Increment and grab the next sequence number
        const sequenceNumber = this.revSequenceNumber();

        let origin: api.IBranchOrigin = undefined;

        if (message.operation.type === api.Integrate) {
            // Branch operation is the original message
            const branchOperation = message.operation.contents as core.ISequencedOperationMessage;
            const branchDocumentMessage = branchOperation.operation as api.ISequencedDocumentMessage;
            const branchClientId = getBranchClientId(branchOperation.documentId);

            // Do I transform the ref or the MSN - I guess the ref here because it's that key space
            const transformedRefSeqNumber = this.transformBranchSequenceNumber(
                branchDocumentMessage.referenceSequenceNumber);
            const transformedMinSeqNumber = this.transformBranchSequenceNumber(
                branchDocumentMessage.minimumSequenceNumber);

            // Update the branch mappings
            this.branchMap.add(branchDocumentMessage.sequenceNumber, sequenceNumber);
            this.branchMap.updateBase(branchDocumentMessage.minimumSequenceNumber);

            // A merge message contains the sequencing information in the target branch's (i.e. this)
            // coordinate space. But contains the original message in the contents.
            const transformed: core.IRawOperationMessage = {
                clientId: branchDocumentMessage.clientId,
                documentId: this.documentId,
                operation: {
                    clientSequenceNumber: branchDocumentMessage.sequenceNumber,
                    contents: branchDocumentMessage.contents,
                    encrypted: branchDocumentMessage.encrypted,
                    encryptedContents: branchDocumentMessage.encryptedContents,
                    referenceSequenceNumber: transformedRefSeqNumber,
                    traces: message.operation.traces,
                    type: branchDocumentMessage.type,
                },
                timestamp: message.timestamp,
                type: core.RawOperationType,
                userId: branchDocumentMessage.userId,
            };

            // Set origin information for the message
            origin = {
                id: branchOperation.documentId,
                minimumSequenceNumber: branchDocumentMessage.minimumSequenceNumber,
                sequenceNumber: branchDocumentMessage.sequenceNumber,
            };

            message = transformed;

            // Update the entry for the branch client
            this.upsertClient(branchClientId, transformedMinSeqNumber, message.timestamp, false);
        } else {
            if (message.clientId) {
                // We checked earlier for the below case
                assert(
                    message.operation.referenceSequenceNumber >= this.minimumSequenceNumber,
                    `${message.operation.referenceSequenceNumber} >= ${this.minimumSequenceNumber}`);

                this.upsertClient(
                    message.clientId,
                    message.operation.referenceSequenceNumber,
                    message.timestamp,
                    true);
            } else {
                // The system will notify of clients leaving - in this case we can remove them from the MSN map
                if (message.operation.type === api.ClientLeave) {
                    this.removeClient(message.operation.contents);
                } else if (message.operation.type === api.Fork) {
                    winston.info(`Fork ${message.documentId} -> ${message.operation.contents.name}`);
                }
            }
        }

        // Store the previous minimum sequene number we returned and then update it
        this.minimumSequenceNumber = this.getMinimumSequenceNumber(objectMessage.timestamp);

        // Add traces
        let traces = message.operation.traces;
        if (traces !== undefined) {
            traces.push(trace);
            traces.push( {service: "deli", action: "end", timestamp: Date.now()});
        }

        // And now craft the output message
        let outputMessage: api.ISequencedDocumentMessage = {
            clientId: message.clientId,
            clientSequenceNumber: message.operation.clientSequenceNumber,
            contents: message.operation.contents,
            encrypted: message.operation.encrypted,
            encryptedContents: message.operation.encryptedContents,
            minimumSequenceNumber: this.minimumSequenceNumber,
            origin,
            referenceSequenceNumber: message.operation.referenceSequenceNumber,
            sequenceNumber,
            traces,
            type: message.operation.type,
            userId: message.userId,
        };

        // tslint:disable-next-line:max-line-length
        winston.verbose(`Assigning ticket ${objectMessage.documentId}@${sequenceNumber}:${this.minimumSequenceNumber} at topic@${this.logOffset}`);

        const sequencedMessage: core.ISequencedOperationMessage = {
            documentId: objectMessage.documentId,
            operation: outputMessage,
            type: core.SequencedOperationType,
        };

        this.sendMessage(sequencedMessage);
    }

    private sendMessage(message: core.ITicketedMessage) {
        // Checkpoint the current state
        const checkpoint = this.generateCheckpoint();

        // Otherwise send the message to the event hub
        this.throughput.produce();
        this.producer.send(JSON.stringify(message), message.documentId).then(
            (result) => {
                this.throughput.acknolwedge();
                this.checkpointContext.checkpoint(checkpoint);
            },
            (error) => {
                // TODO issue with Kafka - need to propagate the issue somehow
                winston.error("Could not send message", error);
            });
    }

    /**
     * Generates a checkpoint of the current ticketing state
     */
    private generateCheckpoint(): ICheckpoint {
        return {
            branchMap: this.branchMap ? this.branchMap.serialize() : undefined,
            clients: _.clone(_.values(this.clientNodeMap).map((value) => value.value)),
            logOffset: this.logOffset,
            sequenceNumber : this.sequenceNumber,
        };
    }

    /**
     * Returns a new sequence number
     */
    private revSequenceNumber(): number {
        return ++this.sequenceNumber;
    }

    private transformBranchSequenceNumber(sequenceNumber: number): number {
        // -1 indicates an unused sequence number
        return sequenceNumber !== -1 ? this.branchMap.get(sequenceNumber) : -1;
    }

    private upsertClient(
        clientId: string,
        referenceSequenceNumber: number,
        timestamp: number,
        canEvict: boolean) {

        // Add the client ID to our map if this is the first time we've seen it
        if (!(clientId in this.clientNodeMap)) {
            const newNode = this.clientSeqNumbers.add({
                canEvict,
                clientId,
                lastUpdate: timestamp,
                referenceSequenceNumber,
            });
            this.clientNodeMap[clientId] = newNode;
        }

        // And then update its values
        this.updateClient(clientId, timestamp, referenceSequenceNumber);
    }

    /**
     * Remoes the provided client from the list of tracked clients
     */
    private removeClient(clientId: string) {
        if (!(clientId in this.clientNodeMap)) {
            // We remove idle clients which may cause us to have already removed this client
            return;
        }

        // Remove the client from the list of nodes
        const details = this.clientNodeMap[clientId];
        this.clientSeqNumbers.remove(details);
        delete this.clientNodeMap[clientId];
    }

    /**
     * Updates the sequence number of the specified client
     */
    private updateClient(clientId: string, timestamp: number, referenceSequenceNumber: number) {
        // Lookup the node and then update its value based on the message
        const heapNode = this.clientNodeMap[clientId];

        heapNode.value.referenceSequenceNumber = referenceSequenceNumber;
        heapNode.value.lastUpdate = timestamp;
        this.clientSeqNumbers.update(heapNode);
    }

    private getMinimumSequenceNumber(timestamp: number): number {
        const MinSequenceNumberWindow = agent.constants.MinSequenceNumberWindow;

        // Get the sequence number as tracked by the clients
        let msn = this.getClientMinimumSequenceNumber(timestamp);

        // If no client MSN fall back to existing values
        msn = msn === -1 ? (this.window ? this.window.secondaryHead : 0) : msn;

        // Create the window if it doesn't yet exist
        if (!this.window) {
            this.window = new RangeTracker(timestamp - MinSequenceNumberWindow, msn);
        }

        // And retrieve the window relative MSN
        // To account for clock skew we always insert later than the last packet
        // TODO see if Kafka can compute the timestamp - or find some other way to go about this
        timestamp = Math.max(timestamp, this.window.primaryHead);

        // Below is a temporary workaround before we add nack support.
        // The client tracked  MSN is not guaranteed to monotonically increase since a new client may connect that
        // has a reference sequence number greater than the lagged min but less than existing clients.
        // The range code assumes we only add monotonically increasing values. So we force this by making sure
        // we add values greater than the last value. The ideal with the time lag is take a minimum value within
        // the time range. But this is a bit more code than the below. And we plan on removing it anyway. The time
        // lag should avoid any issues from setting the min too high as well.
        if (msn < this.window.secondaryHead) {
            msn = this.window.secondaryHead;
        }
        this.window.add(timestamp, msn);
        this.window.updateBase(timestamp - MinSequenceNumberWindow);
        const windowStamp = this.window.get(timestamp - MinSequenceNumberWindow);

        return windowStamp;
    }

    /**
     * Retrieves the minimum sequence number. A timestamp is provided to expire old clients.
     */
    private getClientMinimumSequenceNumber(timestamp: number): number {
        while (this.clientSeqNumbers.count() > 0) {
            const client = this.clientSeqNumbers.peek();
            if (!client.value.canEvict || timestamp - client.value.lastUpdate < this.clientTimeout) {
                return client.value.referenceSequenceNumber;
            }

            winston.verbose(`Expiring ${client.value.clientId}`);
            this.clientSeqNumbers.get();
            delete this.clientNodeMap[client.value.clientId];
        }

        // No client sequence number is available
        return -1;
    }
}
