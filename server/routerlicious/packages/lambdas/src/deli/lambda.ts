/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable no-null/no-null */

import * as assert from "assert";
import { RangeTracker } from "@microsoft/fluid-common-utils";
import { isSystemType } from "@microsoft/fluid-protocol-base";
import {
    ISequencedDocumentAugmentedMessage,
    IBranchOrigin,
    IClientJoin,
    IDocumentMessage,
    IDocumentSystemMessage,
    ISequencedDocumentMessage,
    ISequencedDocumentSystemMessage,
    ITrace,
    MessageType,
} from "@microsoft/fluid-protocol-definitions";
import { canSummarize } from "@microsoft/fluid-server-services-client";
import {
    ControlMessageType,
    extractBoxcar,
    ICollection,
    IContext,
    IControlMessage,
    IDocument,
    IMessage,
    INackMessage,
    IPartitionLambda,
    IProducer,
    IRawOperationMessage,
    ISequencedOperationMessage,
    ITicketedMessage,
    NackOperationType,
    RawOperationType,
    SequencedOperationType,
    IQueuedMessage,
} from "@microsoft/fluid-server-services-core";
import { CheckpointContext, ICheckpointParams, IClientSequenceNumber, IDeliCheckpoint } from "./checkpointContext";
import { ClientSequenceNumberManager } from "./clientSeqManager";

enum IncomingMessageOrder {
    Duplicate,
    Gap,
    ConsecutiveOrSystem,
}

enum SendType {
    Immediate,
    Later,
    Never,
}

enum InstructionType {
    ClearCache,
    NoOp,
}

interface ITicketedMessageOutput {

    message: ITicketedMessage;

    msn: number;

    timestamp: number;

    type: string;

    send: SendType;

    nacked: boolean;

    instruction: InstructionType;
}

/**
 * Maps from a branch to a clientId stored in the MSN map
 */
const getBranchClientId = (branch: string) => `branch$${branch}`;

export class DeliLambda implements IPartitionLambda {
    private sequenceNumber: number = undefined;
    private logOffset: number;

    // Client sequence number mapping
    private readonly clientSeqManager = new ClientSequenceNumberManager();
    private minimumSequenceNumber = 0;
    private readonly branchMap: RangeTracker;
    private readonly checkpointContext: CheckpointContext;
    private lastSendP = Promise.resolve();
    private lastSentMSN = 0;
    private lastInstruction = InstructionType.NoOp;
    private idleTimer: any;
    private noopTimer: any;
    private noActiveClients = false;
    // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
    // @ts-ignore
    private canClose = false;

    constructor(
        private readonly context: IContext,
        private readonly tenantId: string,
        private readonly documentId: string,
        dbObject: IDocument,
        collection: ICollection<IDocument>,
        private readonly forwardProducer: IProducer,
        private readonly reverseProducer: IProducer,
        private readonly clientTimeout: number,
        private readonly activityTimeout: number,
        private readonly noOpConsolidationTimeout: number) {

        const lastCheckpoint = JSON.parse(dbObject.deli);

        // Instantiate existing clients
        if (lastCheckpoint.clients) {
            for (const client of lastCheckpoint.clients) {
                this.clientSeqManager.upsertClient(
                    client.clientId,
                    client.clientSequenceNumber,
                    client.referenceSequenceNumber,
                    client.lastUpdate,
                    client.canEvict,
                    client.scopes,
                    client.nack);
            }
        }

        // Setup branch information
        if (dbObject.parent) {
            if (lastCheckpoint.branchMap) {
                this.branchMap = new RangeTracker(lastCheckpoint.branchMap);
            } else {
                // Initialize the range tracking window
                this.branchMap = new RangeTracker(
                    dbObject.parent.minimumSequenceNumber,
                    dbObject.parent.minimumSequenceNumber);
                for (let i = dbObject.parent.minimumSequenceNumber + 1; i <= dbObject.parent.sequenceNumber; i++) {
                    this.branchMap.add(i, i);
                }

                // Add in the client representing the parent
                this.clientSeqManager.upsertClient(
                    getBranchClientId(dbObject.parent.documentId),
                    dbObject.parent.sequenceNumber,
                    dbObject.parent.minimumSequenceNumber,
                    dbObject.createTime,
                    false);
            }
        }

        // Initialize counting context
        this.sequenceNumber = lastCheckpoint.sequenceNumber;
        const msn = this.clientSeqManager.getMinimumSequenceNumber();
        this.minimumSequenceNumber = msn === -1 ? this.sequenceNumber : msn;

        this.logOffset = lastCheckpoint.logOffset;
        this.checkpointContext = new CheckpointContext(this.tenantId, this.documentId, collection, context);
    }

    public handler(rawMessage: IQueuedMessage): void {
        // In cases where we are reprocessing messages we have already checkpointed exit early
        if (rawMessage.offset <= this.logOffset) {
            return;
        }

        this.logOffset = rawMessage.offset;

        const boxcar = extractBoxcar(rawMessage);

        for (const message of boxcar.contents) {

            // Ticket current message.
            const ticketedMessage = this.ticket(message, this.createTrace("start"));

            // Return early if message is invalid
            if (!ticketedMessage) {
                continue;
            }

            this.lastInstruction = ticketedMessage.instruction;

            if (!ticketedMessage.nacked) {
                // Check for idle clients.
                this.checkIdleClients(ticketedMessage);

                // Check for document inactivity.
                if (!(ticketedMessage.type === MessageType.NoClient || ticketedMessage.type === MessageType.Control)
                    && this.noActiveClients) {
                    this.sendToAlfred(this.createOpMessage(MessageType.NoClient));
                }

                // Return early if sending is not required.
                if (ticketedMessage.send === SendType.Never) {
                    continue;
                }

                // Return early but start a timer to create consolidated message.
                this.clearNoopConsolidationTimer();
                if (ticketedMessage.send === SendType.Later) {
                    this.setNoopConsolidationTimer();
                    continue;
                }
            }

            // Update the msn last sent.
            this.lastSentMSN = ticketedMessage.msn;
            this.lastSendP = this.sendToScriptorium(ticketedMessage.message);
        }

        const checkpoint = this.generateCheckpoint(rawMessage);
        // TODO optimize this to avoid doing per message
        // Checkpoint the current state
        this.lastSendP.then(
            () => {
                if (this.lastInstruction === InstructionType.ClearCache) {
                    checkpoint.clear = true;
                }
                this.checkpointContext.checkpoint(checkpoint);
            },
            (error) => {
                this.context.log.error(`Could not send message to scriptorium: ${JSON.stringify(error)}`);
                this.context.error(error, true);
            });

        // Start a timer to check inactivity on the document. To trigger idle client leave message,
        // we send a noop back to alfred. The noop should trigger a client leave message if there are any.
        this.clearIdleTimer();
        this.setIdleTimer();
    }

    public close() {
        this.checkpointContext.close();

        this.clearIdleTimer();
        this.clearNoopConsolidationTimer();
    }

    private ticket(rawMessage: IMessage, trace: ITrace): ITicketedMessageOutput {
        // Exit out early for unknown messages
        if (rawMessage.type !== RawOperationType) {
            return;
        }

        // Update and retrieve the minimum sequence number
        let message = rawMessage as IRawOperationMessage;
        let systemContent = this.extractSystemContent(message);

        // Check incoming message order. Nack if there is any gap so that the client can resend.
        const messageOrder = this.checkOrder(message, systemContent);
        if (messageOrder === IncomingMessageOrder.Duplicate) {
            return;
        } else if (messageOrder === IncomingMessageOrder.Gap) {
            return this.createNackMessage(message);
        }

        // Cases only applies to non-integration messages
        if (message.operation.type !== MessageType.Integrate) {
            // Handle client join/leave and fork messages.
            if (!message.clientId) {
                if (message.operation.type === MessageType.ClientLeave) {
                    // Return if the client has already been removed due to a prior leave message.
                    if (!this.clientSeqManager.removeClient(systemContent)) {
                        return;
                    }
                } else if (message.operation.type === MessageType.ClientJoin) {
                    const clientJoinMessage = systemContent as IClientJoin;
                    this.clientSeqManager.upsertClient(
                        clientJoinMessage.clientId,
                        0,
                        this.minimumSequenceNumber,
                        message.timestamp,
                        true,
                        clientJoinMessage.detail.scopes);
                    this.canClose = false;
                } else if (message.operation.type === MessageType.Fork) {
                    this.context.log.info(`Fork ${message.documentId} -> ${systemContent.name}`);
                }
            } else {
                // Nack inexistent client.
                const client = this.clientSeqManager.get(message.clientId);
                if (!client || client.nack) {
                    return this.createNackMessage(message);
                }
                // Verify that the message is within the current window.
                // -1 check just for directly sent ops (e.g., using REST API).
                if (message.clientId &&
                    message.operation.referenceSequenceNumber !== -1 &&
                    message.operation.referenceSequenceNumber < this.minimumSequenceNumber) {
                    this.clientSeqManager.upsertClient(
                        message.clientId,
                        message.operation.clientSequenceNumber,
                        this.minimumSequenceNumber,
                        message.timestamp,
                        true,
                        [],
                        true);
                    return this.createNackMessage(message);
                }
                // Nack if an unauthorized client tries to summarize.
                if (message.operation.type === MessageType.Summarize) {
                    if (!canSummarize(client.scopes)) {
                        return this.createNackMessage(message);
                    }
                }
            }
        }

        // Get the current sequence number and increment it if appropriate.
        // We don't increment sequence number for noops sent by client since they will
        // be consolidated and sent later as raw message.
        let sequenceNumber = this.sequenceNumber;
        let origin: IBranchOrigin;
        if (message.operation.type === MessageType.Integrate) {
            sequenceNumber = this.revSequenceNumber();

            // Branch operation is the original message
            const branchOperation = systemContent as ISequencedOperationMessage;
            const branchDocumentMessage = branchOperation.operation;
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
            const operation: IDocumentMessage = {
                clientSequenceNumber: branchDocumentMessage.sequenceNumber,
                contents: branchDocumentMessage.contents,
                referenceSequenceNumber: transformedRefSeqNumber,
                traces: message.operation.traces,
                type: branchDocumentMessage.type,
            };
            if (isSystemType(branchDocumentMessage.type)) {
                const systemMessage = operation as IDocumentSystemMessage;
                systemMessage.data = (branchDocumentMessage as ISequencedDocumentSystemMessage).data;
            }

            const transformed: IRawOperationMessage = {
                clientId: branchDocumentMessage.clientId,
                documentId: this.documentId,
                operation,
                tenantId: message.tenantId,
                timestamp: message.timestamp,
                type: RawOperationType,
            };

            // Set origin information for the message
            origin = {
                id: branchOperation.documentId,
                minimumSequenceNumber: branchDocumentMessage.minimumSequenceNumber,
                sequenceNumber: branchDocumentMessage.sequenceNumber,
            };

            message = transformed;
            // Need to re-extract system content for the transformed messages
            systemContent = this.extractSystemContent(message);

            // Update the entry for the branch client
            this.clientSeqManager.upsertClient(
                branchClientId,
                branchDocumentMessage.sequenceNumber,
                transformedMinSeqNumber,
                message.timestamp,
                false);
        } else {
            if (message.clientId) {
                // Don't rev for client sent no-ops
                if (message.operation.type !== MessageType.NoOp) {
                    // Rev the sequence number
                    sequenceNumber = this.revSequenceNumber();
                    // We checked earlier for the below case. Why checking again?
                    // Only for directly sent ops (e.g., using REST API). To avoid getting nacked,
                    // We rev the refseq number to current sequence number.
                    if (message.operation.referenceSequenceNumber === -1) {
                        message.operation.referenceSequenceNumber = sequenceNumber;
                    }
                }
                assert(
                    message.operation.referenceSequenceNumber >= this.minimumSequenceNumber,
                    `${message.operation.referenceSequenceNumber} >= ${this.minimumSequenceNumber}`);

                this.clientSeqManager.upsertClient(
                    message.clientId,
                    message.operation.clientSequenceNumber,
                    message.operation.referenceSequenceNumber,
                    message.timestamp,
                    true);
            } else {
                // Don't rev for server sent no-ops, noClient, or Control messages.
                if (!(message.operation.type === MessageType.NoOp ||
                    message.operation.type === MessageType.NoClient ||
                    message.operation.type === MessageType.Control)) {
                    sequenceNumber = this.revSequenceNumber();
                }
            }
        }

        // Store the previous minimum sequence number we returned and then update it. If there are no clients
        // then set the MSN to the next SN.
        const msn = this.clientSeqManager.getMinimumSequenceNumber();
        if (msn === -1) {
            this.minimumSequenceNumber = sequenceNumber;
            this.noActiveClients = true;
        } else {
            this.minimumSequenceNumber = msn;
            this.noActiveClients = false;
        }

        let sendType = SendType.Immediate;
        let instruction = InstructionType.NoOp;

        // Sequence number was never rev'd for NoOps/noClients. We will decide now based on heuristics.
        if (message.operation.type === MessageType.NoOp) {
            // Set up delay sending of client sent no-ops
            if (message.clientId) {
                if (message.operation.contents === null) {
                    sendType = SendType.Later;
                } else {
                    if (this.minimumSequenceNumber <= this.lastSentMSN) {
                        sendType = SendType.Later;
                    } else {
                        sequenceNumber = this.revSequenceNumber();
                    }
                }
            } else {
                if (this.minimumSequenceNumber <= this.lastSentMSN) {
                    sendType = SendType.Never;
                } else {
                    // Only rev if we need to send a new msn.
                    sequenceNumber = this.revSequenceNumber();
                }
            }
        } else if (message.operation.type === MessageType.NoClient) {
            // Only rev if no clients have shown up since last noClient was sent to alfred.
            if (this.noActiveClients) {
                sequenceNumber = this.revSequenceNumber();
                message.operation.referenceSequenceNumber = sequenceNumber;
                this.minimumSequenceNumber = sequenceNumber;
            } else {
                sendType = SendType.Never;
            }
        } else if (message.operation.type === MessageType.Control) {
            sendType = SendType.Never;
            const controlMessage = systemContent as IControlMessage;
            if (controlMessage.type === ControlMessageType.UpdateDSN) {
                this.context.log.info(
                    `Update DSN for ${this.tenantId}/${this.documentId}: ${JSON.stringify(controlMessage)}`);
                // TODO: Make specific interface type for controlContents. The schema should be more clear
                // as we introduce more of these.
                const controlContent = controlMessage.contents as
                    {
                        durableSequenceNumber: number
                        clearCache: boolean
                    };
                // Deli cache is only cleared when no clients have joined since last noClient was sent to alfred.
                if (controlContent.clearCache && this.noActiveClients) {
                    instruction = InstructionType.ClearCache;
                    this.canClose = true;
                    this.context.log.info(`Deli cache will be cleared for ${this.tenantId}/${this.documentId}`);
                }
            }
        }

        // Add traces
        if (message.operation.traces && message.operation.traces.length > 1) {
            message.operation.traces.push(trace);
            message.operation.traces.push(this.createTrace("end"));
        }

        // And now craft the output message
        const outputMessage = this.createOutputMessage(message, origin, sequenceNumber, systemContent);

        const sequencedMessage: ISequencedOperationMessage = {
            documentId: message.documentId,
            operation: outputMessage,
            tenantId: message.tenantId,
            type: SequencedOperationType,
        };

        return {
            instruction,
            message: sequencedMessage,
            msn: this.minimumSequenceNumber,
            nacked: false,
            send: sendType,
            timestamp: message.timestamp,
            type: message.operation.type,
        };
    }

    private extractSystemContent(message: IRawOperationMessage) {
        if (isSystemType(message.operation.type)) {
            const operation = message.operation as IDocumentSystemMessage;
            if (operation.data) {
                return JSON.parse(operation.data);
            }
        }
    }

    private createOutputMessage(
        message: IRawOperationMessage,
        origin: IBranchOrigin,
        sequenceNumber: number,
        systemContent,
    ): ISequencedDocumentMessage {
        const outputMessage: ISequencedDocumentMessage = {
            clientId: message.clientId,
            clientSequenceNumber: message.operation.clientSequenceNumber,
            contents: message.operation.contents,
            metadata: message.operation.metadata,
            minimumSequenceNumber: this.minimumSequenceNumber,
            origin,
            referenceSequenceNumber: message.operation.referenceSequenceNumber,
            sequenceNumber,
            timestamp: Date.now(),
            traces: message.operation.traces,
            type: message.operation.type,
        };
        if (message.operation.type === MessageType.Summarize || message.operation.type === MessageType.NoClient) {
            const augmentedOutputMessage = outputMessage as ISequencedDocumentAugmentedMessage;
            const checkpointData = JSON.stringify(this.generateDeliCheckpoint());
            augmentedOutputMessage.additionalContent = checkpointData;
            return augmentedOutputMessage;
        } else if (systemContent !== undefined) { // TODO to consolidate the logic here
            const systemOutputMessage = outputMessage as ISequencedDocumentSystemMessage;
            systemOutputMessage.data = JSON.stringify(systemContent);
            return systemOutputMessage;
        } else {
            return outputMessage;
        }
    }

    private checkOrder(message: IRawOperationMessage, content: any): IncomingMessageOrder {
        if (message.operation.type !== MessageType.Integrate && !message.clientId) {
            return IncomingMessageOrder.ConsecutiveOrSystem;
        }

        let clientId: string;
        let clientSequenceNumber: number;
        if (message.operation.type === MessageType.Integrate) {
            clientId = getBranchClientId(content.documentId);
            clientSequenceNumber = content.operation.sequenceNumber;
        } else {
            clientId = message.clientId;
            clientSequenceNumber = message.operation.clientSequenceNumber;
        }

        const client = this.clientSeqManager.get(clientId);
        if (!client) {
            return IncomingMessageOrder.ConsecutiveOrSystem;
        }

        // Perform duplicate and gap detection - Check that we have a monotonically increasing CID
        const expectedClientSequenceNumber = client.clientSequenceNumber + 1;
        if (clientSequenceNumber === expectedClientSequenceNumber) {
            return IncomingMessageOrder.ConsecutiveOrSystem;
        } else if (clientSequenceNumber > expectedClientSequenceNumber) {
            this.context.log.info(
                `Gap ${clientId}:${expectedClientSequenceNumber} > ${clientSequenceNumber}`);
            return IncomingMessageOrder.Gap;
        } else {
            this.context.log.info(
                `Duplicate ${clientId}:${expectedClientSequenceNumber} < ${clientSequenceNumber}`);
            return IncomingMessageOrder.Duplicate;
        }
    }

    // eslint-disable-next-line @typescript-eslint/promise-function-async
    private sendToScriptorium(message: ITicketedMessage): Promise<void> {
        return this.forwardProducer.send([message], message.tenantId, message.documentId);
    }

    private sendToAlfred(message: IRawOperationMessage) {
        this.reverseProducer.send([message], message.tenantId, message.documentId).catch((error) => {
            this.context.log.error(`Could not send message to alfred: ${JSON.stringify(error)}`);
            this.context.error(error, true);
        });
    }

    // Check if there are any old/idle clients. Craft and send a leave message to alfred.
    // To prevent recurrent leave message sending, leave messages are only piggybacked with
    // other message type.
    private checkIdleClients(message: ITicketedMessageOutput) {
        if (message.type !== MessageType.ClientLeave) {
            const idleClient = this.getIdleClient(message.timestamp);
            if (idleClient) {
                const leaveMessage = this.createLeaveMessage(idleClient.clientId);
                this.sendToAlfred(leaveMessage);
            }
        }
    }

    /**
     * Creates a leave message for inactive clients.
     */
    private createLeaveMessage(clientId: string): IRawOperationMessage {
        const operation: IDocumentSystemMessage = {
            clientSequenceNumber: -1,
            contents: null,
            data: JSON.stringify(clientId),
            referenceSequenceNumber: -1,
            traces: [],
            type: MessageType.ClientLeave,
        };
        const leaveMessage: IRawOperationMessage = {
            clientId: null,
            documentId: this.documentId,
            operation,
            tenantId: this.tenantId,
            timestamp: Date.now(),
            type: RawOperationType,
        };
        return leaveMessage;
    }

    /**
     * Creates a nack message for out of window/disconnected clients.
     */
    private createNackMessage(message: IRawOperationMessage): ITicketedMessageOutput {
        const nackMessage: INackMessage = {
            clientId: message.clientId,
            documentId: this.documentId,
            operation: {
                operation: message.operation,
                sequenceNumber: this.minimumSequenceNumber,
            },
            tenantId: this.tenantId,
            type: NackOperationType,
        };
        return {
            instruction: InstructionType.NoOp,
            message: nackMessage,
            msn: this.minimumSequenceNumber,
            nacked: true,
            send: SendType.Immediate,
            timestamp: message.timestamp,
            type: message.operation.type,
        };
    }

    private createOpMessage(type: string): IRawOperationMessage {
        const noOpMessage: IRawOperationMessage = {
            clientId: null,
            documentId: this.documentId,
            operation: {
                clientSequenceNumber: -1,
                contents: null,
                referenceSequenceNumber: -1,
                traces: [],
                type,
            },
            tenantId: this.tenantId,
            timestamp: Date.now(),
            type: RawOperationType,
        };
        return noOpMessage;
    }

    /**
     * Creates a new trace
     */
    private createTrace(action: string) {
        const trace: ITrace = {
            action,
            service: "deli",
            timestamp: Date.now(),
        };
        return trace;
    }

    /**
     * Generates a checkpoint of the current ticketing state
     */
    private generateCheckpoint(queuedMessage: IQueuedMessage): ICheckpointParams {
        const deliCheckpoint = this.generateDeliCheckpoint();
        const checkpoint = deliCheckpoint as ICheckpointParams;
        checkpoint.queuedMessage = queuedMessage;
        return checkpoint;
    }

    private generateDeliCheckpoint(): IDeliCheckpoint {
        return {
            branchMap: this.branchMap ? this.branchMap.serialize() : undefined,
            clients: this.clientSeqManager.cloneValues(),
            logOffset: this.logOffset,
            sequenceNumber: this.sequenceNumber,
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
     * Get idle client.
     */
    private getIdleClient(timestamp: number): IClientSequenceNumber {
        if (this.clientSeqManager.count() > 0) {
            const client = this.clientSeqManager.peek();
            if (client.canEvict && (timestamp - client.lastUpdate > this.clientTimeout)) {
                return client;
            }
        }
    }

    private setIdleTimer() {
        if (this.noActiveClients) {
            return;
        }
        this.idleTimer = setTimeout(() => {
            if (!this.noActiveClients) {
                const noOpMessage = this.createOpMessage(MessageType.NoOp);
                this.sendToAlfred(noOpMessage);
            }
        }, this.activityTimeout);
    }

    private clearIdleTimer() {
        if (this.idleTimer !== undefined) {
            clearTimeout(this.idleTimer);
            this.idleTimer = undefined;
        }
    }

    private setNoopConsolidationTimer() {
        if (this.noActiveClients) {
            return;
        }
        this.noopTimer = setTimeout(() => {
            if (!this.noActiveClients) {
                const noOpMessage = this.createOpMessage(MessageType.NoOp);
                this.sendToAlfred(noOpMessage);
            }
        }, this.noOpConsolidationTimeout);
    }

    private clearNoopConsolidationTimer() {
        if (this.noopTimer !== undefined) {
            clearTimeout(this.noopTimer);
            this.noopTimer = undefined;
        }
    }
}
