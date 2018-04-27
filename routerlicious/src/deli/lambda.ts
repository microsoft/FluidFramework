import * as assert from "assert";
import * as _ from "lodash";
import * as winston from "winston";
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
        clientSequenceNumber: 0,
        lastUpdate: -1,
        nack: false,
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
    private clientNodeMap = new Map<string, utils.IHeapNode<IClientSequenceNumber>>();
    private clientSeqNumbers = new utils.Heap<IClientSequenceNumber>(SequenceNumberComparer);
    private minimumSequenceNumber = 0;
    private branchMap: RangeTracker;
    private checkpointContext: CheckpointContext;

    constructor(
        context: IContext,
        tenantId: string,
        private documentId: string,
        dbObject: core.IDocument,
        collection: core.ICollection<core.IDocument>,
        private producer: utils.IProducer,
        private clientTimeout: number) {

        // Instantiate existing clients
        if (dbObject.clients) {
            for (const client of dbObject.clients) {
                this.upsertClient(
                    client.clientId,
                    client.clientSequenceNumber,
                    client.referenceSequenceNumber,
                    client.lastUpdate,
                    client.canEvict,
                    client.nack);
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
                    getBranchClientId(dbObject.parent.documentId),
                    dbObject.parent.sequenceNumber,
                    dbObject.parent.minimumSequenceNumber,
                    dbObject.createTime,
                    false);
            }
        }

        // Initialize counting context
        this.sequenceNumber = dbObject.sequenceNumber;
        this.logOffset = dbObject.logOffset;
        this.checkpointContext = new CheckpointContext(tenantId, documentId, collection, context);
    }

    public handler(message: utils.IMessage): void {
        // Trace for the message.
        const trace: api.ITrace = { service: "deli", action: "start", timestamp: Date.now()};
        this.ticket(message, trace);
    }

    public close() {
        this.checkpointContext.close();
    }

    private ticket(rawMessage: utils.IMessage, trace: api.ITrace): void {
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

        if (this.isDuplicate(message)) {
            return;
        }

        // Nack handling - only applies to non-integration messages
        if (message.operation.type !== api.Integrate) {
            if (message.clientId) {
                // Get the node for the clientID - NACK if non-existent
                const node = this.clientNodeMap.get(message.clientId);
                if (!node || node.value.nack) {
                    this.sendNack(message);
                    return;
                }

                // Verify that the message is within the current window
                if (message.clientId && message.operation.referenceSequenceNumber < this.minimumSequenceNumber) {
                    // Add in a placeholder for the nack'ed client to allow them to rejoin at the current MSN
                    this.upsertClient(
                        message.clientId,
                        message.operation.clientSequenceNumber,
                        this.minimumSequenceNumber,
                        message.timestamp,
                        true,
                        true);

                    // Send the nack message
                    this.sendNack(message);

                    return;
                }
            } else {
                if (message.operation.type === api.ClientJoin) {
                    this.upsertClient(
                        message.operation.contents,
                        0,
                        this.minimumSequenceNumber,
                        message.timestamp,
                        true);
                } else if (message.operation.type === api.ClientLeave) {
                    this.removeClient(message.operation.contents);
                } else if (message.operation.type === api.Fork) {
                    winston.info(`Fork ${message.documentId} -> ${message.operation.contents.name}`);
                }
            }
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
                    referenceSequenceNumber: transformedRefSeqNumber,
                    traces: message.operation.traces,
                    type: branchDocumentMessage.type,
                },
                tenantId: message.tenantId,
                timestamp: message.timestamp,
                type: core.RawOperationType,
                user: branchDocumentMessage.user,
            };

            // Set origin information for the message
            origin = {
                id: branchOperation.documentId,
                minimumSequenceNumber: branchDocumentMessage.minimumSequenceNumber,
                sequenceNumber: branchDocumentMessage.sequenceNumber,
            };

            message = transformed;

            // Update the entry for the branch client
            this.upsertClient(
                branchClientId,
                branchDocumentMessage.sequenceNumber,
                transformedMinSeqNumber,
                message.timestamp,
                false);
        } else {
            if (message.clientId) {
                // We checked earlier for the below case
                assert(
                    message.operation.referenceSequenceNumber >= this.minimumSequenceNumber,
                    `${message.operation.referenceSequenceNumber} >= ${this.minimumSequenceNumber}`);

                this.upsertClient(
                    message.clientId,
                    message.operation.clientSequenceNumber,
                    message.operation.referenceSequenceNumber,
                    message.timestamp,
                    true);
            }
        }

        // Store the previous minimum sequene number we returned and then update it. If there are no clients
        // then set the MSN to the next SN.
        const msn = this.getMinimumSequenceNumber(objectMessage.timestamp);
        this.minimumSequenceNumber = msn === -1 ? sequenceNumber : msn;

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
            minimumSequenceNumber: this.minimumSequenceNumber,
            origin,
            referenceSequenceNumber: message.operation.referenceSequenceNumber,
            sequenceNumber,
            traces,
            type: message.operation.type,
            user: message.user,
        };

        // tslint:disable-next-line:max-line-length
        winston.verbose(`Assigning ticket ${objectMessage.documentId}@${sequenceNumber}:${this.minimumSequenceNumber} at topic@${this.logOffset}`);

        const sequencedMessage: core.ISequencedOperationMessage = {
            documentId: objectMessage.documentId,
            operation: outputMessage,
            tenantId: objectMessage.tenantId,
            type: core.SequencedOperationType,
        };

        this.sendMessage(sequencedMessage);
    }

    private isDuplicate(message: core.IRawOperationMessage): boolean {
        if (message.operation.type !== api.Integrate && !message.clientId) {
            return false;
        }

        let clientId: string;
        let clientSequenceNumber: number;
        if (message.operation.type === api.Integrate) {
            clientId = getBranchClientId(message.operation.contents.documentId);
            clientSequenceNumber = message.operation.contents.operation.sequenceNumber;
        } else {
            clientId = message.clientId;
            clientSequenceNumber = message.operation.clientSequenceNumber;
        }

        // TODO second check is to maintain back compat - can remove after deployment
        const node = this.clientNodeMap.get(clientId);
        if (!node || (node.value.clientSequenceNumber === undefined)) {
            return false;
        }

        // Perform duplicate detection on client IDs - Check that we have an increasing CID
        // For back compat ignore the 0/undefined message
        if (clientSequenceNumber && (node.value.clientSequenceNumber + 1 !== clientSequenceNumber)) {
            // tslint:disable-next-line:max-line-length
            winston.info(`Duplicate ${node.value.clientId}:${node.value.clientSequenceNumber} !== ${clientSequenceNumber}`);
            return true;
        }

        return false;
    }

    private sendMessage(message: core.ITicketedMessage) {
        // TODO optimize this to aviod doing per message
        // Checkpoint the current state
        const checkpoint = this.generateCheckpoint();

        // Otherwise send the message to the event hub
        this.throughput.produce();
        this.producer.send(JSON.stringify(message), message.documentId).then(
            (result) => {
                this.throughput.acknowlwedge();
                this.checkpointContext.checkpoint(checkpoint);
            },
            (error) => {
                // TODO issue with Kafka - need to propagate the issue somehow
                winston.error("Could not send message", error);
            });
    }

    private sendNack(message: core.IRawOperationMessage) {
        const nackMessage: core.INackMessage = {
            clientId: message.clientId,
            documentId: message.documentId,
            operation: {
                operation: message.operation,
                sequenceNumber: this.minimumSequenceNumber,
            },
            tenantId: message.tenantId,
            type: core.NackOperationType,
        };

        this.sendMessage(nackMessage);
    }

    /**
     * Generates a checkpoint of the current ticketing state
     */
    private generateCheckpoint(): ICheckpoint {
        const clients: IClientSequenceNumber[] = [];
        for (const [, value] of this.clientNodeMap) {
            clients.push(_.clone(value.value));
        }

        return {
            branchMap: this.branchMap ? this.branchMap.serialize() : undefined,
            clients,
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

    /**
     * Begins tracking or updates an already tracked client.
     * @param clientId The client identifier
     * @param referenceSequenceNumber The sequence number the client is at
     * @param timestamp The time of the operation
     * @param canEvict Flag indicating whether or not we can evict the client (branch clients cannot be evicted)
     * @param nack Flag indicating whether we have nacked this client
     */
    private upsertClient(
        clientId: string,
        clientSequenceNumber: number,
        referenceSequenceNumber: number,
        timestamp: number,
        canEvict: boolean,
        nack: boolean = false) {

        // Add the client ID to our map if this is the first time we've seen it
        if (!this.clientNodeMap.has(clientId)) {
            const newNode = this.clientSeqNumbers.add({
                canEvict,
                clientId,
                clientSequenceNumber,
                lastUpdate: timestamp,
                nack,
                referenceSequenceNumber,
            });
            this.clientNodeMap.set(clientId, newNode);
        }

        // And then update its values
        this.updateClient(clientId, timestamp, clientSequenceNumber, referenceSequenceNumber, nack);
    }

    /**
     * Remoes the provided client from the list of tracked clients
     */
    private removeClient(clientId: string) {
        if (!this.clientNodeMap.has(clientId)) {
            // We remove idle clients which may cause us to have already removed this client
            return;
        }

        // Remove the client from the list of nodes
        const details = this.clientNodeMap.get(clientId);
        this.clientSeqNumbers.remove(details);
        this.clientNodeMap.delete(clientId);
    }

    /**
     * Updates the sequence number of the specified client
     */
    private updateClient(
        clientId: string,
        timestamp: number,
        clientSequenceNumber: number,
        referenceSequenceNumber: number,
        nack: boolean) {

        // Lookup the node and then update its value based on the message
        const heapNode = this.clientNodeMap.get(clientId);
        heapNode.value.referenceSequenceNumber = referenceSequenceNumber;
        heapNode.value.clientSequenceNumber = clientSequenceNumber;
        heapNode.value.lastUpdate = timestamp;
        heapNode.value.nack = nack;
        this.clientSeqNumbers.update(heapNode);
    }

    /**
     * Retrieves the minimum sequence number. A timestamp is provided to expire old clients.
     */
    private getMinimumSequenceNumber(timestamp: number): number {
        while (this.clientSeqNumbers.count() > 0) {
            const client = this.clientSeqNumbers.peek();
            if (!client.value.canEvict || timestamp - client.value.lastUpdate < this.clientTimeout) {
                return client.value.referenceSequenceNumber;
            }

            this.clientSeqNumbers.get();
            this.clientNodeMap.delete(client.value.clientId);
        }

        // No clients are in the window
        return -1;
    }
}
