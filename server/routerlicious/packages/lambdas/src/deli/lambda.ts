/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable no-null/no-null */

import { RangeTracker } from "@fluidframework/common-utils";
import { isSystemType } from "@fluidframework/protocol-base";
import {
    ISequencedDocumentAugmentedMessage,
    IBranchOrigin,
    IClientJoin,
    IDocumentSystemMessage,
    ISequencedDocumentMessage,
    ISequencedDocumentSystemMessage,
    ITrace,
    MessageType,
    NackErrorType,
} from "@fluidframework/protocol-definitions";
import { canSummarize } from "@fluidframework/server-services-client";
import {
    ControlMessageType,
    extractBoxcar,
    IClientSequenceNumber,
    IContext,
    IControlMessage,
    IDeliState,
    IMessage,
    INackMessage,
    IPartitionLambda,
    IProducer,
    IRawOperationMessage,
    ISequencedOperationMessage,
    IServiceConfiguration,
    ITicketedMessage,
    NackOperationType,
    RawOperationType,
    SequencedOperationType,
    IQueuedMessage,
    IUpdateDSNControlMessageContents,
    INackFutureMessagesControlMessageContents,
} from "@fluidframework/server-services-core";
import { CheckpointContext } from "./checkpointContext";
import { ClientSequenceNumberManager } from "./clientSeqManager";
import { IDeliCheckpointManager, ICheckpointParams } from "./checkpointManager";

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

export class DeliLambda implements IPartitionLambda {
    private sequenceNumber: number;
    private durableSequenceNumber: number;

    // 'epoch' and 'term' are readonly and should never change when lambda is running.
    private readonly term: number;
    private readonly epoch: number;

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
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    private canClose = false;

    // when set, all messages will be nacked based on the provided info
    private nackFutureMessages: INackFutureMessagesControlMessageContents | undefined;

    constructor(
        private readonly context: IContext,
        private readonly tenantId: string,
        private readonly documentId: string,
        readonly lastCheckpoint: IDeliState,
        checkpointManager: IDeliCheckpointManager,
        private readonly forwardProducer: IProducer,
        private readonly reverseProducer: IProducer,
        private readonly serviceConfiguration: IServiceConfiguration) {
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

        // Initialize counting context
        this.sequenceNumber = lastCheckpoint.sequenceNumber;
        this.term = lastCheckpoint.term;
        this.epoch = lastCheckpoint.epoch;
        this.durableSequenceNumber = lastCheckpoint.durableSequenceNumber;
        const msn = this.clientSeqManager.getMinimumSequenceNumber();
        this.minimumSequenceNumber = msn === -1 ? this.sequenceNumber : msn;

        this.logOffset = lastCheckpoint.logOffset;
        this.checkpointContext = new CheckpointContext(this.tenantId, this.documentId, checkpointManager, context);
    }

    public handler(rawMessage: IQueuedMessage): void {
        // In cases where we are reprocessing messages we have already checkpointed exit early
        if (rawMessage.offset <= this.logOffset) {
            this.context.checkpoint(rawMessage);
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
                const messageMetaData = {
                    documentId: this.documentId,
                    tenantId: this.tenantId,
                };
                this.context.log.error(
                    `Could not send message to scriptorium: ${JSON.stringify(error)}`, { messageMetaData });
                this.context.error(error, {
                    restart: true,
                    tenantId: this.tenantId,
                    documentId: this.documentId,
                });
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
        const message = rawMessage as IRawOperationMessage;
        const systemContent = this.extractSystemContent(message);

        // Check if we should nack all messages
        if (this.nackFutureMessages) {
            return this.createNackMessage(
                message,
                this.nackFutureMessages.code,
                this.nackFutureMessages.type,
                this.nackFutureMessages.message,
                this.nackFutureMessages.retryAfter);
        }

        // Check incoming message order. Nack if there is any gap so that the client can resend.
        const messageOrder = this.checkOrder(message);
        if (messageOrder === IncomingMessageOrder.Duplicate) {
            return;
        } else if (messageOrder === IncomingMessageOrder.Gap) {
            return this.createNackMessage(
                message,
                400,
                NackErrorType.BadRequestError,
                `Gap detected in incoming op`);
        }

        // Handle client join/leave messages.
        if (!message.clientId) {
            if (message.operation.type === MessageType.ClientLeave) {
                // Return if the client has already been removed due to a prior leave message.
                if (!this.clientSeqManager.removeClient(systemContent)) {
                    return;
                }
            } else if (message.operation.type === MessageType.ClientJoin) {
                const clientJoinMessage = systemContent as IClientJoin;
                const isNewClient = this.clientSeqManager.upsertClient(
                    clientJoinMessage.clientId,
                    0,
                    this.minimumSequenceNumber,
                    message.timestamp,
                    true,
                    clientJoinMessage.detail.scopes);
                // Return if the client has already been added due to a prior join message.
                if (!isNewClient) {
                    return;
                }
                this.canClose = false;
            }
        } else {
            // Nack inexistent client.
            const client = this.clientSeqManager.get(message.clientId);
            if (!client || client.nack) {
                return this.createNackMessage(
                    message,
                    400,
                    NackErrorType.BadRequestError,
                    `Nonexistent client`);
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
                return this.createNackMessage(
                    message,
                    400,
                    NackErrorType.BadRequestError,
                    `Refseq ${message.operation.referenceSequenceNumber} < ${this.minimumSequenceNumber}`);
            }
            // Nack if an unauthorized client tries to summarize.
            if (message.operation.type === MessageType.Summarize) {
                if (!canSummarize(client.scopes)) {
                    return this.createNackMessage(
                        message,
                        403,
                        NackErrorType.InvalidScopeError,
                        `Client ${message.clientId} does not have summary permission`);
                }
            }
        }

        // Get the current sequence number and increment it if appropriate.
        // We don't increment sequence number for noops sent by client since they will
        // be consolidated and sent later as raw message.
        let sequenceNumber = this.sequenceNumber;
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
            switch (controlMessage.type) {
                case ControlMessageType.UpdateDSN: {
                    const messageMetaData = {
                        documentId: this.documentId,
                        tenantId: this.tenantId,
                    };
                    this.context.log.info(`Update DSN: ${JSON.stringify(controlMessage)}`, { messageMetaData });

                    const controlContents = controlMessage.contents as IUpdateDSNControlMessageContents;
                    const dsn = controlContents.durableSequenceNumber;
                    if (dsn >= this.durableSequenceNumber) {
                        // Deli cache is only cleared when no clients have joined since last noClient was sent to alfred
                        if (controlContents.clearCache && this.noActiveClients) {
                            instruction = InstructionType.ClearCache;
                            this.canClose = true;
                            this.context.log.info(`Deli cache will be cleared`, { messageMetaData });
                        }

                        this.durableSequenceNumber = dsn;
                    }

                    break;
                }

                case ControlMessageType.NackFutureMessages: {
                    this.nackFutureMessages = controlMessage.contents as INackFutureMessagesControlMessageContents;
                    break;
                }

                default:
                // ignore unknown control messages
            }
        }

        // Add traces
        if (message.operation.traces && message.operation.traces.length > 1) {
            message.operation.traces.push(trace);
            message.operation.traces.push(this.createTrace("end"));
        }

        // And now craft the output message
        const outputMessage = this.createOutputMessage(message, undefined /* origin */, sequenceNumber, systemContent);

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
                // eslint-disable-next-line @typescript-eslint/no-unsafe-return
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
            serverMetadata: message.operation.serverMetadata,
            minimumSequenceNumber: this.minimumSequenceNumber,
            origin,
            referenceSequenceNumber: message.operation.referenceSequenceNumber,
            sequenceNumber,
            term: this.term,
            timestamp: message.timestamp,
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

    private checkOrder(message: IRawOperationMessage): IncomingMessageOrder {
        if (!message.clientId) {
            return IncomingMessageOrder.ConsecutiveOrSystem;
        }

        const clientId = message.clientId;
        const clientSequenceNumber = message.operation.clientSequenceNumber;

        const client = this.clientSeqManager.get(clientId);
        if (!client) {
            return IncomingMessageOrder.ConsecutiveOrSystem;
        }
        const messageMetaData = {
            documentId: this.documentId,
            tenantId: this.tenantId,
        };
        // Perform duplicate and gap detection - Check that we have a monotonically increasing CID
        const expectedClientSequenceNumber = client.clientSequenceNumber + 1;
        if (clientSequenceNumber === expectedClientSequenceNumber) {
            return IncomingMessageOrder.ConsecutiveOrSystem;
        } else if (clientSequenceNumber > expectedClientSequenceNumber) {
            this.context.log.info(
                `Gap ${clientId}:${expectedClientSequenceNumber} > ${clientSequenceNumber}`, { messageMetaData });
            return IncomingMessageOrder.Gap;
        } else {
            this.context.log.info(
                `Duplicate ${clientId}:${expectedClientSequenceNumber} < ${clientSequenceNumber}`, { messageMetaData });
            return IncomingMessageOrder.Duplicate;
        }
    }

    // eslint-disable-next-line @typescript-eslint/promise-function-async
    private sendToScriptorium(message: ITicketedMessage): Promise<void> {
        return this.forwardProducer.send([message], message.tenantId, message.documentId);
    }

    private sendToAlfred(message: IRawOperationMessage) {
        this.reverseProducer.send([message], message.tenantId, message.documentId).catch((error) => {
            const messageMetaData = {
                documentId: this.documentId,
                tenantId: this.tenantId,
            };
            this.context.log.error(`Could not send message to alfred: ${JSON.stringify(error)}`, { messageMetaData });
            this.context.error(error, {
                restart: true,
                tenantId: this.tenantId,
                documentId: this.documentId,
            });
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
            traces: this.serviceConfiguration.enableTraces ? [] : undefined,
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
     * Creates a nack message for clients.
     */
    private createNackMessage(
        message: IRawOperationMessage,
        code: number,
        type: NackErrorType,
        reason: string,
        retryAfter?: number): ITicketedMessageOutput {
        const nackMessage: INackMessage = {
            clientId: message.clientId,
            documentId: this.documentId,
            operation: {
                content: {
                    code,
                    type,
                    message: reason,
                    retryAfter,
                },
                operation: message.operation,
                sequenceNumber: this.minimumSequenceNumber,
            },
            tenantId: this.tenantId,
            timestamp: Date.now(),
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
                traces: this.serviceConfiguration.enableTraces ? [] : undefined,
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

    private generateDeliCheckpoint(): IDeliState {
        return {
            branchMap: this.branchMap ? this.branchMap.serialize() : undefined,
            clients: this.clientSeqManager.cloneValues(),
            durableSequenceNumber: this.durableSequenceNumber,
            epoch: this.epoch,
            logOffset: this.logOffset,
            sequenceNumber: this.sequenceNumber,
            term: this.term,
        };
    }

    /**
     * Returns a new sequence number
     */
    private revSequenceNumber(): number {
        return ++this.sequenceNumber;
    }

    /**
     * Get idle client.
     */
    private getIdleClient(timestamp: number): IClientSequenceNumber {
        if (this.clientSeqManager.count() > 0) {
            const client = this.clientSeqManager.peek();
            if (client.canEvict && (timestamp - client.lastUpdate > this.serviceConfiguration.deli.clientTimeout)) {
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
        }, this.serviceConfiguration.deli.activityTimeout);
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
        }, this.serviceConfiguration.deli.noOpConsolidationTimeout);
    }

    private clearNoopConsolidationTimer() {
        if (this.noopTimer !== undefined) {
            clearTimeout(this.noopTimer);
            this.noopTimer = undefined;
        }
    }
}
