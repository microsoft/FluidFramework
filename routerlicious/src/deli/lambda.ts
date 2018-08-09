import * as assert from "assert";
import * as _ from "lodash";
import now = require("performance-now");
import * as winston from "winston";
import * as api from "../api-core";
import * as core from "../core";
import { RangeTracker } from "../core-utils";
import { IContext, IPartitionLambda } from "../kafka-service/lambdas";
import * as utils from "../utils";
import { CheckpointContext, ICheckpoint, IClientSequenceNumber } from "./checkpointContext";

export interface ITicketedMessageOutput {

    message: core.ITicketedMessage;

    timestamp: number;

    user: api.ITenantUser;
}

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
    private sequenceNumber: number = undefined;
    private logOffset: number;

    // Client sequence number mapping
    private clientNodeMap = new Map<string, utils.IHeapNode<IClientSequenceNumber>>();
    private clientSeqNumbers = new utils.Heap<IClientSequenceNumber>(SequenceNumberComparer);
    private minimumSequenceNumber = 0;
    private branchMap: RangeTracker;
    private checkpointContext: CheckpointContext;
    private idleTimer: any;

    constructor(
        context: IContext,
        private tenantId: string,
        private documentId: string,
        dbObject: core.IDocument,
        collection: core.ICollection<core.IDocument>,
        private producer: utils.IProducer,
        private clientTimeout: number,
        private activityTimeout: number) {

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
        this.checkpointContext = new CheckpointContext(this.tenantId, this.documentId, collection, context);
    }

    public handler(message: utils.IMessage, crafted = false): void {
        // Ticket current message.
        const ticketedMessage = this.ticket(message, this.createTrace());

        // Return early if message is not valid.
        if (!ticketedMessage) {
            return;
        }

        const outputMessages = [ticketedMessage.message];

        // Check if there are any old/idle clients. Craft and ticket a leave message.
        // Piggyback with the actual kafka message.
        const idleClient = this.getIdleClient(ticketedMessage.timestamp);
        if (idleClient) {
            const leaveMessage = this.createLeaveMessage(idleClient.clientId, ticketedMessage.user);
            const kafkaLeaveMessage = this.createKafkaMessage(leaveMessage, message);
            outputMessages.push(this.ticket(kafkaLeaveMessage, this.createTrace()).message);
        }

        // We only checkpoint real kafka message. Crafted kafka messages are not checkpointed since
        // they share the same offset with the last kafka message.
        crafted ? this.sendMessages(outputMessages) : this.sendAndCheckpoint(outputMessages);

        // Start a timer to check inactivity on the document. To trigger idle client leave message,
        // we send a noop. The noop should trigger a client leave message if there are idle clients.
        if (this.idleTimer) {
            clearTimeout(this.idleTimer);
        }
        this.idleTimer = setTimeout(() => {
            const noOpMessage = this.createNoOpMessage();
            const kafkaNoOpMessage = this.createKafkaMessage(noOpMessage, message);
            this.handler(kafkaNoOpMessage, true);
        }, this.activityTimeout);
    }

    public close() {
        this.checkpointContext.close();
    }

    private ticket(rawMessage: utils.IMessage, trace: api.ITrace): ITicketedMessageOutput {
        // In cases where we are reprocessing messages we have already checkpointed exit early
        if (rawMessage.offset < this.logOffset) {
            return;
        }

        this.logOffset = rawMessage.offset;

        const rawMessageContent = rawMessage.value.toString();
        const parsedRawMessage = utils.safelyParseJSON(rawMessageContent);
        if (parsedRawMessage === undefined) {
            winston.error(`Invalid JSON input: ${rawMessageContent}`);
            return;
        }

        // Update the client's reference sequence number based on the message type
        const objectMessage = parsedRawMessage as core.IObjectMessage;

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
                    return this.createNackMessage(message, objectMessage.user);
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

                    return this.createNackMessage(message, objectMessage.user);
                }
            } else {
                if (message.operation.type === api.ClientJoin) {
                    this.upsertClient(
                        message.operation.contents.clientId,
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

        let origin: api.IBranchOrigin;

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
        const msn = this.getMinimumSequenceNumber();
        this.minimumSequenceNumber = msn === -1 ? sequenceNumber : msn;

        // Add traces
        const traces = message.operation.traces;
        if (traces !== undefined) {
            traces.push(trace);
            traces.push(this.createTrace());
        }

        // And now craft the output message
        const outputMessage: api.ISequencedDocumentMessage = {
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

        return {
            message: sequencedMessage,
            timestamp: objectMessage.timestamp,
            user: message.user,
        };
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

    /**
     * Sends messages to kafka and checkpoints current context on success.
     */
    private sendAndCheckpoint(messages: core.ITicketedMessage[]) {
        // TODO optimize this to aviod doing per message
        // Checkpoint the current state
        const checkpoint = this.generateCheckpoint();

        this.sendMessages(messages).then(
            (result) => {
                this.checkpointContext.checkpoint(checkpoint);
            },
            (error) => {
                // TODO issue with Kafka - need to propagate the issue somehow
                winston.error("Could not send message", error);
            });
    }

    /**
     * Sends messages to kafka.
     */
    private async sendMessages(messages: core.ITicketedMessage[]) {
        const sendPromises = [];
        messages.map((message) => sendPromises.push(this.producer.send(JSON.stringify(message), message.documentId)));
        await Promise.all(sendPromises);
    }

    /**
     * Creates a leave message for inactive clients.
     */
    private createLeaveMessage(
        clientId: string,
        user: api.ITenantUser): core.IRawOperationMessage {
        const leaveMessage: core.IRawOperationMessage = {
            clientId: null,
            documentId: this.documentId,
            operation: {
                clientSequenceNumber: -1,
                contents: clientId,
                referenceSequenceNumber: -1,
                traces: [],
                type: api.ClientLeave,
            },
            tenantId: this.tenantId,
            timestamp: Date.now(),
            type: core.RawOperationType,
            user,
        };
        return leaveMessage;
    }

    /**
     * Creates a nack message for out of window/disconnected clients.
     */
    private createNackMessage(message: core.IRawOperationMessage, user: api.ITenantUser): ITicketedMessageOutput {
        const nackMessage: core.INackMessage = {
            clientId: message.clientId,
            documentId: this.documentId,
            operation: {
                operation: message.operation,
                sequenceNumber: this.minimumSequenceNumber,
            },
            tenantId: this.tenantId,
            type: core.NackOperationType,
        };
        return {
            message: nackMessage,
            timestamp: message.timestamp,
            user,
        };
    }

    private createNoOpMessage(): core.IRawOperationMessage {
        const noOpMessage: core.IRawOperationMessage = {
            clientId: null,
            documentId: this.documentId,
            operation: {
                clientSequenceNumber: -1,
                contents: null,
                referenceSequenceNumber: -1,
                traces: [],
                type: api.NoOp,
            },
            tenantId: this.tenantId,
            timestamp: Date.now(),
            type: core.RawOperationType,
            user: null,
        };
        return noOpMessage;
    }

    /**
     * Creates a raw kafka message with the same properties of last kafka message.
     */
    private createKafkaMessage(
        rawMessage: core.IRawOperationMessage,
        lastKafkaMessage: utils.IMessage): utils.IMessage {
        const kafkaMessage: utils.IMessage = {
            highWaterOffset: lastKafkaMessage.highWaterOffset,
            key: lastKafkaMessage.key,
            offset: lastKafkaMessage.offset,
            partition: lastKafkaMessage.partition,
            topic: lastKafkaMessage.topic,
            value: JSON.stringify(rawMessage),
        };
        return kafkaMessage;
    }

    /**
     * Creates a new trace
     */
    private createTrace() {
        const trace: api.ITrace = {
            action: "start",
            service: "deli",
            timestamp: now(),
        };
        return trace;
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
     * Retrieves the minimum sequence number.
     */
    private getMinimumSequenceNumber(): number {
        if (this.clientSeqNumbers.count() > 0) {
            const client = this.clientSeqNumbers.peek();
            return client.value.referenceSequenceNumber;
        } else {
            return -1;
        }
    }

    /**
     * Get idle client.
     */
    private getIdleClient(timestamp: number): IClientSequenceNumber {
        if (this.clientSeqNumbers.count() > 0) {
            const client = this.clientSeqNumbers.peek();
            if (client.value.canEvict && (timestamp - client.value.lastUpdate > this.clientTimeout)) {
                return client.value;
            }
        }
    }
}
