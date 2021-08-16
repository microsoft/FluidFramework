/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable no-null/no-null */

import { EventEmitter } from "events";
import { isServiceMessageType } from "@fluidframework/protocol-base";
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
    ILambdaStartControlMessageContents,
    IQueuedMessage,
    INackMessagesControlMessageContents,
    IUpdateDSNControlMessageContents,
    LambdaCloseType,
    LambdaName,
} from "@fluidframework/server-services-core";
import {
    CommonProperties,
    Lumber,
    LumberEventName,
    Lumberjack,
    BaseTelemetryProperties,
    SessionState,
} from "@fluidframework/server-services-telemetry";
import { setQueuedMessageProperties } from "../utils";
import { CheckpointContext } from "./checkpointContext";
import { ClientSequenceNumberManager } from "./clientSeqManager";
import { IDeliCheckpointManager, ICheckpointParams } from "./checkpointManager";
import { createSessionMetric } from "./utils";

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

export enum OpEventType {
    Idle,
    MaxOps,
    MaxTime,
}

export class DeliLambda extends EventEmitter implements IPartitionLambda {
    private sequenceNumber: number;
    private durableSequenceNumber: number;

    // 'epoch' and 'term' are readonly and should never change when lambda is running.
    private readonly term: number;
    private readonly epoch: number;

    private logOffset: number;

    // Client sequence number mapping
    private readonly clientSeqManager = new ClientSequenceNumberManager();
    private minimumSequenceNumber = 0;
    private readonly checkpointContext: CheckpointContext;
    private lastSendP = Promise.resolve();
    private lastNoClientP = Promise.resolve();
    private lastSentMSN = 0;
    private lastInstruction = InstructionType.NoOp;

    private activityIdleTimer: any;
    private noopEvent: any;

    // Op event properties
    private opIdleTimer: any | undefined;
    private opMaxTimeTimer: any | undefined;
    private sequencedMessagesSinceLastOpEvent: number = 0;

    private noActiveClients: boolean;
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    private canClose = false;
    private nextKafkaCheckpointMessage: IQueuedMessage | undefined;

    // when set, messages will be nacked based on the provided info
    private nackMessages: INackMessagesControlMessageContents | undefined;

    // Session level properties
    private serviceSummaryGenerated: boolean = false;
    private readonly isNewDocument: boolean = false;
    private readonly successfullyStartedLambdas: LambdaName[] = [];
    private readonly expectedSuccessfullyStartedLambdas: LambdaName[] = [LambdaName.Scribe];

    constructor(
        private readonly context: IContext,
        private readonly tenantId: string,
        private readonly documentId: string,
        readonly lastCheckpoint: IDeliState,
        checkpointManager: IDeliCheckpointManager,
        private readonly forwardProducer: IProducer,
        private readonly reverseProducer: IProducer,
        private readonly serviceConfiguration: IServiceConfiguration,
        private sessionMetric: Lumber<LumberEventName.SessionResult> | undefined,
        private sessionStartMetric: Lumber<LumberEventName.StartSessionResult> | undefined) {
        super();

        // Instantiate existing clients
        if (lastCheckpoint.clients) {
            for (const client of lastCheckpoint.clients) {
                if (client.clientId) {
                    this.clientSeqManager.upsertClient(
                        client.clientId,
                        client.clientSequenceNumber,
                        client.referenceSequenceNumber,
                        client.lastUpdate,
                        client.canEvict,
                        client.scopes,
                        client.nack,
                        client.serverMetadata);
                }
            }
        }

        // Initialize counting context
        this.sequenceNumber = lastCheckpoint.sequenceNumber;
        this.term = lastCheckpoint.term;
        this.epoch = lastCheckpoint.epoch;
        this.durableSequenceNumber = lastCheckpoint.durableSequenceNumber;
        this.lastSentMSN = lastCheckpoint.lastSentMSN ?? 0;
        this.logOffset = lastCheckpoint.logOffset;
        this.nackMessages = lastCheckpoint.nackMessages;
        this.successfullyStartedLambdas = lastCheckpoint.successfullyStartedLambdas;

        const msn = this.clientSeqManager.getMinimumSequenceNumber();
        this.noActiveClients = msn === -1;
        this.minimumSequenceNumber = this.noActiveClients ? this.sequenceNumber : msn;

        this.checkpointContext = new CheckpointContext(this.tenantId, this.documentId, checkpointManager, context);

        // start the activity idle timer when created
        this.setActivityIdleTimer();

        if (this.serviceConfiguration.deli.opEvent.enable) {
            this.updateOpMaxTimeTimer();
        }

        this.isNewDocument = this.sequenceNumber === 0;

        if (serviceConfiguration.enableLumberMetrics) {
            this.logSessionStartMetrics();
        }
    }

    public handler(rawMessage: IQueuedMessage) {
        let kafkaCheckpointMessage: IQueuedMessage | undefined;
        const lumberJackMetric = this.serviceConfiguration.enableLambdaMetrics ?
            Lumberjack.newLumberMetric(LumberEventName.DeliHandler) : undefined;

        if (lumberJackMetric) {
            lumberJackMetric.setProperties({
                [BaseTelemetryProperties.tenantId]: this.tenantId,
                [BaseTelemetryProperties.documentId]: this.documentId,
            });
            setQueuedMessageProperties(rawMessage, lumberJackMetric);
        }

        // In cases where we are reprocessing messages we have already checkpointed exit early
        if (rawMessage.offset <= this.logOffset) {
            kafkaCheckpointMessage = this.getKafkaCheckpointMessage(rawMessage);
            if (kafkaCheckpointMessage) {
                this.context.checkpoint(kafkaCheckpointMessage);
            }

            lumberJackMetric?.success(`Already processed upto offset ${this.logOffset}.
                Current message offset ${rawMessage.offset}`);
            return undefined;
        }

        this.logOffset = rawMessage.offset;

        let sequencedMessageCount = 0;

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
                    this.lastNoClientP = this.sendToAlfred(this.createOpMessage(MessageType.NoClient));
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

            sequencedMessageCount++;
        }

        kafkaCheckpointMessage = this.getKafkaCheckpointMessage(rawMessage);
        const checkpoint = this.generateCheckpoint(rawMessage, kafkaCheckpointMessage);

        // TODO optimize this to avoid doing per message
        // Checkpoint the current state
        Promise.all([this.lastSendP, this.lastNoClientP]).then(
            () => {
                if (this.lastInstruction === InstructionType.ClearCache) {
                    checkpoint.clear = true;
                }
                this.checkpointContext.checkpoint(checkpoint);
            },
            (error) => {
                lumberJackMetric?.setProperties(new Map([[CommonProperties.restart, true]]));
                lumberJackMetric?.error("Restarting as message could not be sent to scriptorium", error);
                this.context.log?.error(
                    `Could not send message to scriptorium: ${JSON.stringify(error)}`,
                    {
                        messageMetaData: {
                            documentId: this.documentId,
                            tenantId: this.tenantId,
                        },
                    });
                this.context.error(error, {
                    restart: true,
                    tenantId: this.tenantId,
                    documentId: this.documentId,
                });
            });

        if (lumberJackMetric) {
            this.setDeliStateMetrics(checkpoint, lumberJackMetric);
        }

        // Start a timer to check inactivity on the document. To trigger idle client leave message,
        // we send a noop back to alfred. The noop should trigger a client leave message if there are any.
        this.clearActivityIdleTimer();
        this.setActivityIdleTimer();

        // Update the op event idle & max ops counter if ops were just sequenced
        if (this.serviceConfiguration.deli.opEvent.enable && sequencedMessageCount > 0) {
            this.updateOpIdleTimer();

            const maxOps = this.serviceConfiguration.deli.opEvent.maxOps;
            if (maxOps !== undefined) {
                this.sequencedMessagesSinceLastOpEvent += sequencedMessageCount;

                if (this.sequencedMessagesSinceLastOpEvent > maxOps) {
                    lumberJackMetric?.setProperties({[CommonProperties.maxOpsSinceLastSummary]: true});
                    this.emitOpEvent(OpEventType.MaxOps);
                }
            }
        }

        lumberJackMetric?.success(`Message processed successfully at seq no ${checkpoint.deliState.sequenceNumber}`);
    }

    public close(closeType: LambdaCloseType) {
        this.checkpointContext.close();

        this.clearActivityIdleTimer();
        this.clearNoopConsolidationTimer();

        this.clearOpIdleTimer();
        this.clearOpMaxTimeTimer();

        this.removeAllListeners();

        if (this.serviceConfiguration.enableLumberMetrics) {
            this.logSessionEndMetrics(closeType);
        }
    }

    private logSessionStartMetrics(failMetric: boolean = false) {
        if (this.sessionStartMetric?.isCompleted()) {
            this.sessionStartMetric = createSessionMetric(this.tenantId, this.documentId,
                true, this.serviceConfiguration);
        }

        if (failMetric) {
            this.sessionStartMetric?.setProperties({ [CommonProperties.sessionState]:
                SessionState.LambdaStartFailed });
            this.sessionStartMetric?.error("Lambda start failed");
            return;
        }

        if (this.verifyRequiredLambdaStarted()) {
            if (this.isNewDocument) {
                    this.sessionStartMetric?.setProperties({ [CommonProperties.sessionState]: SessionState.started });
                    this.sessionStartMetric?.success("Session started successfully");
            } else {
                this.sessionStartMetric?.setProperties({ [CommonProperties.sessionState]: SessionState.resumed });
                this.sessionStartMetric?.success("Session resumed successfully");
            }
        } else {
            this.context.log?.info("Not all required lambdas started");
        }
    }

    private verifyRequiredLambdaStarted() {
        return this.expectedSuccessfullyStartedLambdas.every((val) => this.successfullyStartedLambdas.includes(val));
    }

    private logSessionEndMetrics(closeType: LambdaCloseType) {
        if (this.sessionMetric?.isCompleted()) {
            this.sessionMetric = createSessionMetric(this.tenantId, this.documentId, false, this.serviceConfiguration);
        }

        this.sessionMetric?.setProperties({ [CommonProperties.sessionEndReason]: closeType });
        this.sessionMetric?.setProperties({ [CommonProperties.sequenceNumber]: this.sequenceNumber });
        this.sessionMetric?.setProperties({ [CommonProperties.lastSummarySequenceNumber]: this.durableSequenceNumber });

        if (closeType === LambdaCloseType.Error) {
            this.sessionMetric?.setProperties({ [CommonProperties.sessionState]: SessionState.end });
            this.sessionMetric?.error("Session terminated due to error");
        } else if (!closeType || closeType === LambdaCloseType.Stop || closeType === LambdaCloseType.Rebalance) {
            this.sessionMetric?.setProperties({ [CommonProperties.sessionState]: SessionState.paused });
            this.sessionMetric?.success("Session paused");
        } else if (this.serviceConfiguration.deli.checkServiceSummaryStatus && !this.serviceSummaryGenerated) {
            this.sessionMetric?.setProperties({ [CommonProperties.sessionState]: SessionState.end });
            this.sessionMetric?.error("No service summary before lambda close");
        } else if (closeType === LambdaCloseType.ActivityTimeout) {
            this.sessionMetric?.setProperties({ [CommonProperties.sessionState]: SessionState.end });
            this.sessionMetric?.success("Session terminated due to inactivity");
        } else {
            this.sessionMetric?.error("Unknown session end state");
        }
    }

    private setDeliStateMetrics(checkpoint: ICheckpointParams, lumberJackMetric?: Lumber<LumberEventName.DeliHandler>) {
        const deliState = {
            [CommonProperties.clientCount]: checkpoint.deliState.clients?.length,
            [CommonProperties.checkpointOffset]: checkpoint.deliState.logOffset,
            [CommonProperties.sequenceNumber]: checkpoint.deliState.sequenceNumber,
            [CommonProperties.minSequenceNumber]: checkpoint.deliState.lastSentMSN,
        };

        lumberJackMetric?.setProperties(deliState);
    }

    private ticket(rawMessage: IMessage, trace: ITrace): ITicketedMessageOutput | undefined {
        // Exit out early for unknown messages
        if (rawMessage.type !== RawOperationType) {
            return undefined;
        }

        // Update and retrieve the minimum sequence number
        const message = rawMessage as IRawOperationMessage;
        const dataContent = this.extractDataContent(message);

        // Check if we should nack this message
        const nackMessages = this.nackMessages;
        if (nackMessages && this.serviceConfiguration.deli.enableNackMessages) {
            let shouldNack = true;

            if (nackMessages.allowSystemMessages && (isServiceMessageType(message.type) || !message.clientId)) {
                // this is a system message. don't nack it
                shouldNack = false;
            } else if (nackMessages.allowedScopes) {
                const clientId = message.clientId;
                if (clientId) {
                    const client = this.clientSeqManager.get(clientId);
                    if (client) {
                        for (const scope of nackMessages.allowedScopes) {
                            if (client.scopes.includes(scope)) {
                                // this client has an allowed scope. don't nack it
                                shouldNack = false;
                                break;
                            }
                        }
                    }
                }
            }

            if (shouldNack) {
                return this.createNackMessage(
                    message,
                    nackMessages.content.code,
                    nackMessages.content.type,
                    nackMessages.content.message,
                    nackMessages.content.retryAfter);
            }
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

        if (this.isInvalidMessage(message)) {
            return this.createNackMessage(
                message,
                400,
                NackErrorType.BadRequestError,
                `Op not allowed`);
        }

        // Handle client join/leave messages.
        if (!message.clientId) {
            if (message.operation.type === MessageType.ClientLeave) {
                // Return if the client has already been removed due to a prior leave message.
                if (!this.clientSeqManager.removeClient(dataContent)) {
                    return;
                }
            } else if (message.operation.type === MessageType.ClientJoin) {
                const clientJoinMessage = dataContent as IClientJoin;
                const isNewClient = this.clientSeqManager.upsertClient(
                    clientJoinMessage.clientId,
                    0,
                    this.minimumSequenceNumber,
                    message.timestamp,
                    true,
                    clientJoinMessage.detail.scopes,
                    false,
                    message.operation.serverMetadata);
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
            }

            // Only for directly sent ops (e.g., using REST API). To avoid getting nacked,
            // We rev the refseq number to current sequence number.
            if (message.operation.referenceSequenceNumber === -1) {
                message.operation.referenceSequenceNumber = sequenceNumber;
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
            const controlMessage = dataContent as IControlMessage;
            switch (controlMessage.type) {
                case ControlMessageType.UpdateDSN: {
                    this.context.log?.info(`Update DSN: ${JSON.stringify(controlMessage)}`, {
                        messageMetaData: {
                            documentId: this.documentId,
                            tenantId: this.tenantId,
                        },
                    });

                    const controlContents = controlMessage.contents as IUpdateDSNControlMessageContents;
                    this.serviceSummaryGenerated = !controlContents.isClientSummary;
                    const dsn = controlContents.durableSequenceNumber;
                    if (dsn >= this.durableSequenceNumber) {
                        // Deli cache is only cleared when no clients have joined since last noClient was sent to alfred
                        if (controlContents.clearCache && this.noActiveClients) {
                            instruction = InstructionType.ClearCache;
                            this.canClose = true;
                            this.context.log?.info(`Deli cache will be cleared`, {
                                messageMetaData: {
                                    documentId: this.documentId,
                                    tenantId: this.tenantId,
                                },
                            });
                        }

                        this.durableSequenceNumber = dsn;

                        if (this.serviceConfiguration.deli.opEvent.enable) {
                            // since the dsn updated, ops were reliably stored
                            // we can safely restart the MaxTime timer
                            this.updateOpMaxTimeTimer();
                        }
                    }

                    break;
                }

                case ControlMessageType.NackMessages: {
                    this.nackMessages = controlMessage.contents;
                    break;
                }

                case ControlMessageType.LambdaStartResult: {
                    const controlContents = controlMessage.contents as ILambdaStartControlMessageContents;

                    if (controlContents.success) {
                        this.successfullyStartedLambdas.push(controlContents.lambdaName);
                    }

                    this.logSessionStartMetrics(!controlContents.success);
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
        const outputMessage = this.createOutputMessage(message, undefined /* origin */, sequenceNumber, dataContent);

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

    private extractDataContent(message: IRawOperationMessage) {
        if (message.operation.type === MessageType.ClientJoin ||
            message.operation.type === MessageType.ClientLeave ||
            message.operation.type === MessageType.Control) {
            const operation = message.operation as IDocumentSystemMessage;
            if (operation.data) {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-return
                return JSON.parse(operation.data);
            }
        }
    }

    private isInvalidMessage(message: IRawOperationMessage): boolean {
        if (message.clientId) {
            return isServiceMessageType(message.operation.type);
        } else {
            return false;
        }
    }

    private createOutputMessage(
        message: IRawOperationMessage,
        origin: IBranchOrigin | undefined,
        sequenceNumber: number,
        systemContent,
    ): ISequencedDocumentMessage {
        const outputMessage: ISequencedDocumentMessage = {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            clientId: message.clientId!,
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
            this.context.log?.info(
                `Gap ${clientId}:${expectedClientSequenceNumber} > ${clientSequenceNumber}`, { messageMetaData });
            return IncomingMessageOrder.Gap;
        } else {
            this.context.log?.info(
                `Duplicate ${clientId}:${expectedClientSequenceNumber} < ${clientSequenceNumber}`, { messageMetaData });
            return IncomingMessageOrder.Duplicate;
        }
    }

    // eslint-disable-next-line @typescript-eslint/promise-function-async
    private sendToScriptorium(message: ITicketedMessage): Promise<void> {
        return this.forwardProducer.send([message], message.tenantId, message.documentId);
    }

    private async sendToAlfred(message: IRawOperationMessage) {
        try {
            await this.reverseProducer.send([message], message.tenantId, message.documentId);
        } catch (error) {
            this.context.log?.error(
                `Could not send message to alfred: ${JSON.stringify(error)}`,
                {
                    messageMetaData: {
                        documentId: this.documentId,
                        tenantId: this.tenantId,
                    },
                });
            this.context.error(error, {
                restart: true,
                tenantId: this.tenantId,
                documentId: this.documentId,
            });
        }
    }

    // Check if there are any old/idle clients. Craft and send a leave message to alfred.
    // To prevent recurrent leave message sending, leave messages are only piggybacked with
    // other message type.
    private checkIdleClients(message: ITicketedMessageOutput) {
        if (message.type !== MessageType.ClientLeave) {
            const idleClient = this.getIdleClient(message.timestamp);
            if (idleClient?.clientId) {
                const leaveMessage = this.createLeaveMessage(idleClient.clientId, idleClient.serverMetadata);
                void this.sendToAlfred(leaveMessage);
            }
        }
    }

    /**
     * Creates a leave message for inactive clients.
     */
    private createLeaveMessage(clientId: string, serverMetadata?: any): IRawOperationMessage {
        const operation: IDocumentSystemMessage = {
            clientSequenceNumber: -1,
            contents: null,
            data: JSON.stringify(clientId),
            referenceSequenceNumber: -1,
            traces: this.serviceConfiguration.enableTraces ? [] : undefined,
            type: MessageType.ClientLeave,
            serverMetadata,
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
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            clientId: message.clientId!,
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
     * The deli checkpoint is based on rawMessage
     * The kafka checkpoint is based on kafkaCheckpointMessage if clients exist
     * This keeps the kafka checkpoint behind by 1 message until there are no active clients
     * It ensures that the idle timer and subsequent leave & NoClient messages are created
     * If noActiveClients is set, that means we sent a NoClient message. so checkpoint the current offset
     * @returns The queued message for the kafka checkpoint
     */
    private getKafkaCheckpointMessage(rawMessage: IQueuedMessage): IQueuedMessage | undefined {
        const kafkaCheckpointMessage = this.noActiveClients ? rawMessage : this.nextKafkaCheckpointMessage;
        this.nextKafkaCheckpointMessage = rawMessage;
        return kafkaCheckpointMessage;
    }

    /**
     * Generates a checkpoint of the given state
     */
    private generateCheckpoint(
        deliCheckpointMessage: IQueuedMessage,
        kafkaCheckpointMessage: IQueuedMessage | undefined): ICheckpointParams {
        return {
            deliState: this.generateDeliCheckpoint(),
            deliCheckpointMessage,
            kafkaCheckpointMessage,
        };
    }

    private generateDeliCheckpoint(): IDeliState {
        return {
            clients: this.clientSeqManager.cloneValues(),
            durableSequenceNumber: this.durableSequenceNumber,
            epoch: this.epoch,
            logOffset: this.logOffset,
            sequenceNumber: this.sequenceNumber,
            term: this.term,
            lastSentMSN: this.lastSentMSN,
            nackMessages: this.nackMessages ? { ...this.nackMessages } : undefined,
            successfullyStartedLambdas: this.successfullyStartedLambdas,
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
    private getIdleClient(timestamp: number): IClientSequenceNumber | undefined {
        const client = this.clientSeqManager.peek();
        if (client && client.canEvict &&
            (timestamp - client.lastUpdate > this.serviceConfiguration.deli.clientTimeout)) {
            return client;
        }
    }

    private setActivityIdleTimer() {
        if (this.noActiveClients) {
            return;
        }
        this.activityIdleTimer = setTimeout(() => {
            if (!this.noActiveClients) {
                const noOpMessage = this.createOpMessage(MessageType.NoOp);
                void this.sendToAlfred(noOpMessage);
            }
        }, this.serviceConfiguration.deli.activityTimeout);
    }

    private clearActivityIdleTimer() {
        if (this.activityIdleTimer !== undefined) {
            clearTimeout(this.activityIdleTimer);
            this.activityIdleTimer = undefined;
        }
    }

    private setNoopConsolidationTimer() {
        if (this.noActiveClients) {
            return;
        }
        this.noopEvent = setTimeout(() => {
            if (!this.noActiveClients) {
                const noOpMessage = this.createOpMessage(MessageType.NoOp);
                void this.sendToAlfred(noOpMessage);
            }
        }, this.serviceConfiguration.deli.noOpConsolidationTimeout);
    }

    private clearNoopConsolidationTimer() {
        if (this.noopEvent !== undefined) {
            clearTimeout(this.noopEvent);
            this.noopEvent = undefined;
        }
    }

    /**
     * Reset the op event idle timer
     * Called after a message is sequenced
     */
    private updateOpIdleTimer() {
        const idleTime = this.serviceConfiguration.deli.opEvent.idleTime;
        if (idleTime === undefined) {
            return;
        }

        this.clearOpIdleTimer();

        this.opIdleTimer = setTimeout(() => {
            this.emitOpEvent(OpEventType.Idle);
        }, idleTime);
    }

    private clearOpIdleTimer() {
        if (this.opIdleTimer !== undefined) {
            clearTimeout(this.opIdleTimer);
            this.opIdleTimer = undefined;
        }
    }

    /**
     * Resets the op event MaxTime timer
     * Called after an opEvent is emitted or when the dsn is updated
     */
    private updateOpMaxTimeTimer() {
        const maxTime = this.serviceConfiguration.deli.opEvent.maxTime;
        if (maxTime === undefined) {
            return;
        }

        this.clearOpMaxTimeTimer();

        this.opMaxTimeTimer = setTimeout(() => {
            this.emitOpEvent(OpEventType.MaxTime);
        }, maxTime);
    }

    private clearOpMaxTimeTimer() {
        if (this.opMaxTimeTimer !== undefined) {
            clearTimeout(this.opMaxTimeTimer);
            this.opMaxTimeTimer = undefined;
        }
    }

    /**
     * Emits an opEvent based for the provided type
     * Also resets the MaxTime timer
     */
    private emitOpEvent(type: OpEventType) {
        if (this.sequencedMessagesSinceLastOpEvent === 0) {
            // no need to emit since no messages were handled since last time
            return;
        }

        this.emit("opEvent", type, this.sequenceNumber, this.sequencedMessagesSinceLastOpEvent);

        this.sequencedMessagesSinceLastOpEvent = 0;

        this.updateOpMaxTimeTimer();
    }
}
