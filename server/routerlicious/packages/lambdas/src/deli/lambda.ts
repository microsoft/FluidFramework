/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

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
    ScopeType,
} from "@fluidframework/protocol-definitions";
import { canSummarize, defaultHash, getNextHash } from "@fluidframework/server-services-client";
import {
    ControlMessageType,
    extractBoxcar,
    IClientSequenceNumber,
    IContext,
    IControlMessage,
    IDeliState,
    IDisableNackMessagesControlMessageContents,
    IMessage,
    INackMessage,
    IPartitionLambda,
    IProducer,
    IRawOperationMessage,
    ISequencedOperationMessage,
    IServiceConfiguration,
    ITicketedMessage,
    NackMessagesType,
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
    getLumberBaseProperties,
    Lumber,
    LumberEventName,
    Lumberjack,
    SessionState,
} from "@fluidframework/server-services-telemetry";
import { DocumentContext } from "@fluidframework/server-lambdas-driver";
import { TypedEventEmitter } from "@fluidframework/common-utils";
import { IEvent } from "@fluidframework/common-definitions";
import { logCommonSessionEndMetrics, createSessionMetric } from "../utils";
import { CheckpointContext } from "./checkpointContext";
import { ClientSequenceNumberManager } from "./clientSeqManager";
import { IDeliCheckpointManager, ICheckpointParams } from "./checkpointManager";
import { DeliCheckpointReason } from ".";

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

    message: ISequencedDocumentMessage | INackMessage;

    msn: number;

    timestamp: number;

    type: string;

    send: SendType;

    nacked: boolean;

    instruction: InstructionType;
}

/**
 * Used for controlling op event logic
 */
interface IOpEvent {
    idleTimer?: any;
    maxTimer?: any;
    sequencedMessagesSinceLastOpEvent: number;
}

/**
 * Used for controlling checkpoint logic
 */
interface ICheckpoint {
    currentDeliCheckpointMessage?: IQueuedMessage;
    currentKafkaCheckpointMessage?: IQueuedMessage;

    // used for ensuring the lambda remains open while clients are connected
    nextKafkaCheckpointMessage?: IQueuedMessage;

    // time fired due that should kick off a checkpoint when deli is idle
    idleTimer?: any;

    // raw messages since the last checkpoint
    rawMessagesSinceCheckpoint: number;

    // time in milliseconds since the last checkpoint
    lastCheckpointTime: number;
}

export enum OpEventType {
    Idle,
    MaxOps,
    MaxTime,
    UpdatedDurableSequenceNumber,
}

export interface IDeliLambdaEvents extends IEvent {
    (event: "opEvent",
        listener: (type: OpEventType, sequenceNumber: number, sequencedMessagesSinceLastOpEvent: number) => void);
    (event: "updatedDurableSequenceNumber", listener: (durableSequenceNumber: number) => void);
    (event: "close", listener: (type: LambdaCloseType) => void);
}

export class DeliLambda extends TypedEventEmitter<IDeliLambdaEvents> implements IPartitionLambda {
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
    private lastHash: string;
    private lastInstruction = InstructionType.NoOp;

    private activityIdleTimer: any;
    private noopEvent: any;

    /**
     * Used for controlling op event logic
     */
    private readonly opEvent: IOpEvent = { sequencedMessagesSinceLastOpEvent: 0 };

    /**
     * Used for controlling checkpoint logic
     */
    private readonly checkpointInfo: ICheckpoint = {
        lastCheckpointTime: Date.now(),
        rawMessagesSinceCheckpoint: 0,
    };

    private noActiveClients: boolean;
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    private canClose = false;

    // mapping of enabled nack message types. messages will be nacked based on the provided info
    private readonly nackMessages: Map<NackMessagesType, INackMessagesControlMessageContents>;

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
        this.lastHash = lastCheckpoint.expHash1 ?? defaultHash;
        this.term = lastCheckpoint.term;
        this.epoch = lastCheckpoint.epoch;
        this.durableSequenceNumber = lastCheckpoint.durableSequenceNumber;
        this.lastSentMSN = lastCheckpoint.lastSentMSN ?? 0;
        this.logOffset = lastCheckpoint.logOffset;

        if (lastCheckpoint.nackMessages) {
            if (Array.isArray(lastCheckpoint.nackMessages)) {
                this.nackMessages = new Map(lastCheckpoint.nackMessages);
            } else {
                // backwards compat. nackMessages is a INackMessagesControlMessageContents
                this.nackMessages = new Map();

                // extra check for very old nack messages
                const identifier = lastCheckpoint.nackMessages.identifier;
                if (identifier !== undefined) {
                    this.nackMessages.set(identifier, lastCheckpoint.nackMessages);
                }
            }
        } else {
            this.nackMessages = new Map();
        }

        // Null coalescing for backward compatibility
        this.successfullyStartedLambdas = lastCheckpoint.successfullyStartedLambdas ?? [];

        const msn = this.clientSeqManager.getMinimumSequenceNumber();
        this.noActiveClients = msn === -1;
        this.minimumSequenceNumber = this.noActiveClients ? this.sequenceNumber : msn;

        if (this.serviceConfiguration.deli.summaryNackMessages.checkOnStartup) {
            this.checkNackMessagesState();
        }

        this.checkpointContext = new CheckpointContext(this.tenantId, this.documentId, checkpointManager, context);

        // start the activity idle timer when created
        this.setActivityIdleTimer();

        if (this.serviceConfiguration.deli.opEvent.enable) {
            this.updateOpMaxTimeTimer();
        }

        this.isNewDocument = this.sequenceNumber === 0;

        if (serviceConfiguration.enableLumberjack) {
            this.logSessionStartMetrics();
        }
    }

    public handler(rawMessage: IQueuedMessage) {
        // In cases where we are reprocessing messages we have already checkpointed exit early
        if (rawMessage.offset <= this.logOffset) {
            this.updateCheckpointMessages(rawMessage);

            if (this.checkpointInfo.currentKafkaCheckpointMessage) {
                this.context.checkpoint(this.checkpointInfo.currentKafkaCheckpointMessage);
            }

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

            let outgoingMessage: ISequencedOperationMessage | INackMessage;
            if (!ticketedMessage.nacked) {
                // Check for idle clients.
                this.checkIdleClients(ticketedMessage);

                // Check for document inactivity.
                if (!(ticketedMessage.type === MessageType.NoClient || ticketedMessage.type === MessageType.Control)
                    && this.noActiveClients) {
                    this.lastNoClientP = this.sendToAlfred(this.createOpMessage(MessageType.NoClient))
                        .catch((error) => {
                            const errorMsg = "Could not send no client message";
                            this.context.log?.error(
                                `${errorMsg}: ${JSON.stringify(error)}`,
                                {
                                    messageMetaData: {
                                        documentId: this.documentId,
                                        tenantId: this.tenantId,
                                    },
                                });
                            Lumberjack.error(errorMsg, getLumberBaseProperties(this.documentId, this.tenantId), error);
                            this.context.error(error, {
                                restart: true,
                                tenantId: this.tenantId,
                                documentId: this.documentId,
                            });
                        });
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

                // Check if Deli is over the max ops since last summary nack limit
                if (this.serviceConfiguration.deli.summaryNackMessages.enable &&
                    !this.nackMessages.has(NackMessagesType.SummaryMaxOps)) {
                    const opsSinceLastSummary = this.sequenceNumber - this.durableSequenceNumber;
                    if (opsSinceLastSummary > this.serviceConfiguration.deli.summaryNackMessages.maxOps) {
                        // this op brings us over the limit
                        // start nacking non-system ops and ops that are submitted by non-summarizers
                        this.nackMessages.set(NackMessagesType.SummaryMaxOps, {
                            identifier: NackMessagesType.SummaryMaxOps,
                            content: this.serviceConfiguration.deli.summaryNackMessages.nackContent,
                            allowSystemMessages: true,
                            allowedScopes: [ScopeType.SummaryWrite],
                        });
                    }
                }
                const sequencedMessage = ticketedMessage.message as ISequencedDocumentMessage;
                if (this.serviceConfiguration.deli.enableOpHashing) {
                    this.lastHash = getNextHash(sequencedMessage, this.lastHash);
                    sequencedMessage.expHash1 = this.lastHash;
                }

                outgoingMessage = {
                    documentId: this.documentId,
                    operation: sequencedMessage,
                    tenantId: this.tenantId,
                    type: SequencedOperationType,
                };
                sequencedMessageCount++;
            } else {
                outgoingMessage = ticketedMessage.message as INackMessage;
            }

            // Update the msn last sent
            this.lastSentMSN = ticketedMessage.msn;
            this.lastSendP = this.sendToScriptorium(outgoingMessage)
                .catch((error) => {
                    const errorMsg = "Could not send message to scriptorium";
                    this.context.log?.error(
                        `${errorMsg}: ${JSON.stringify(error)}`,
                        {
                            messageMetaData: {
                                documentId: this.documentId,
                                tenantId: this.tenantId,
                            },
                        });
                    Lumberjack.error(errorMsg, getLumberBaseProperties(this.documentId, this.tenantId), error);
                    this.context.error(error, {
                        restart: true,
                        tenantId: this.tenantId,
                        documentId: this.documentId,
                    });
                });
        }

        this.checkpointInfo.rawMessagesSinceCheckpoint++;
        this.updateCheckpointMessages(rawMessage);

        const checkpointReason = this.getCheckpointReason();
        if (checkpointReason !== undefined) {
            // checkpoint the current up to date state
            this.checkpoint(checkpointReason);
        } else {
            this.updateCheckpointIdleTimer();
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
                this.opEvent.sequencedMessagesSinceLastOpEvent += sequencedMessageCount;

                if (this.opEvent.sequencedMessagesSinceLastOpEvent > maxOps) {
                    this.emitOpEvent(OpEventType.MaxOps);
                }
            }
        }
    }

    public close(closeType: LambdaCloseType) {
        this.checkpointContext.close();

        this.clearActivityIdleTimer();
        this.clearNoopConsolidationTimer();
        this.clearCheckpointIdleTimer();
        this.clearOpIdleTimer();
        this.clearOpMaxTimeTimer();

        this.emit("close", closeType);
        this.removeAllListeners();

        if (this.serviceConfiguration.enableLumberjack) {
            this.logSessionEndMetrics(closeType);
        }
    }

    private logSessionStartMetrics(failMetric: boolean = false) {
        if (this.sessionStartMetric?.isCompleted()) {
            this.sessionStartMetric = createSessionMetric(
                this.tenantId,
                this.documentId,
                LumberEventName.StartSessionResult,
                this.serviceConfiguration,
            );
        }

        if (failMetric) {
            this.sessionStartMetric?.setProperties({
                [CommonProperties.sessionState]: SessionState.LambdaStartFailed,
            });
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
            const lambdaStatusMsg = "Not all required lambdas started";
            this.context.log?.info(lambdaStatusMsg);
            Lumberjack.info(lambdaStatusMsg, getLumberBaseProperties(this.documentId, this.tenantId));
        }
    }

    private verifyRequiredLambdaStarted() {
        return this.expectedSuccessfullyStartedLambdas.every((val) => this.successfullyStartedLambdas.includes(val));
    }

    private logSessionEndMetrics(closeType: LambdaCloseType) {
        if (this.sessionMetric?.isCompleted()) {
            this.sessionMetric = createSessionMetric(
                this.tenantId,
                this.documentId,
                LumberEventName.SessionResult,
                this.serviceConfiguration,
            );
        }

        this.sessionMetric?.setProperties({ [CommonProperties.serviceSummarySuccess]: this.serviceSummaryGenerated });

        logCommonSessionEndMetrics(
            this.context as DocumentContext,
            closeType,
            this.sessionMetric,
            this.sequenceNumber,
            this.durableSequenceNumber,
            Array.from(this.nackMessages.keys()),
        );
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
        if (this.nackMessages.size > 0 && this.serviceConfiguration.deli.enableNackMessages) {
            for (const nackMessageControlMessageContents of this.nackMessages.values()) {
                let shouldNack = true;

                if (nackMessageControlMessageContents.allowSystemMessages &&
                    (isServiceMessageType(message.operation.type) || !message.clientId)) {
                    // this is a system message. don't nack it
                    shouldNack = false;
                } else if (nackMessageControlMessageContents.allowedScopes) {
                    const clientId = message.clientId;
                    if (clientId) {
                        const client = this.clientSeqManager.get(clientId);
                        if (client) {
                            for (const scope of nackMessageControlMessageContents.allowedScopes) {
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
                        nackMessageControlMessageContents.content.code,
                        nackMessageControlMessageContents.content.type,
                        nackMessageControlMessageContents.content.message,
                        nackMessageControlMessageContents.content.retryAfter);
                }
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
                    const dsnStatusMsg = `Update DSN: ${JSON.stringify(controlMessage)}`;
                    this.context.log?.info(dsnStatusMsg, {
                        messageMetaData: {
                            documentId: this.documentId,
                            tenantId: this.tenantId,
                        },
                    });
                    Lumberjack.info(dsnStatusMsg, getLumberBaseProperties(this.documentId, this.tenantId));

                    const controlContents = controlMessage.contents as IUpdateDSNControlMessageContents;
                    this.serviceSummaryGenerated = !controlContents.isClientSummary;
                    const dsn = controlContents.durableSequenceNumber;
                    if (dsn >= this.durableSequenceNumber) {
                        // Deli cache is only cleared when no clients have joined since last noClient was sent to alfred
                        if (controlContents.clearCache && this.noActiveClients) {
                            instruction = InstructionType.ClearCache;
                            this.canClose = true;
                            const deliCacheMsg = `Deli cache will be cleared`;
                            this.context.log?.info(deliCacheMsg, {
                                messageMetaData: {
                                    documentId: this.documentId,
                                    tenantId: this.tenantId,
                                },
                            });
                            Lumberjack.info(deliCacheMsg, getLumberBaseProperties(this.documentId, this.tenantId));
                        }

                        this.durableSequenceNumber = dsn;

                        this.checkNackMessagesState();

                        this.emit("updatedDurableSequenceNumber", dsn);

                        if (this.serviceConfiguration.deli.opEvent.enable) {
                            // ops were reliably stored
                            // ensure op event timers & last sequenced op counters are reset
                            // that will make the MaxTime & MaxOps op events accurate
                            this.emitOpEvent(OpEventType.UpdatedDurableSequenceNumber, true);
                        }
                    }

                    break;
                }

                case ControlMessageType.NackMessages: {
                    const controlContents: INackMessagesControlMessageContents |
                        IDisableNackMessagesControlMessageContents = controlMessage.contents;

                    if (controlContents.content !== undefined) {
                        this.nackMessages.set(controlContents.identifier, controlContents);
                    } else {
                        this.nackMessages.delete(controlContents.identifier);
                    }

                    break;
                }

                case ControlMessageType.LambdaStartResult: {
                    const controlContents = controlMessage.contents as ILambdaStartControlMessageContents;

                    if (controlContents.success) {
                        this.successfullyStartedLambdas.push(controlContents.lambdaName);
                    }

                    this.logSessionStartMetrics(!controlContents.success);
                }

                // fallthrough
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

        return {
            instruction,
            message: outputMessage,
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
            if (message.operation.type === MessageType.Summarize ||
                this.serviceConfiguration.scribe.generateServiceSummary) {
                // only add additional content if scribe will use this op for generating a summary
                // NoClient ops are ignored by scribe when generateServiceSummary is disabled
                const checkpointData = JSON.stringify(this.generateDeliCheckpoint());
                augmentedOutputMessage.additionalContent = checkpointData;
            }
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
            const gapDetectionMsg = `Gap ${clientId}:${expectedClientSequenceNumber} > ${clientSequenceNumber}`;
            this.context.log?.info(gapDetectionMsg, { messageMetaData });
            Lumberjack.info(gapDetectionMsg, getLumberBaseProperties(this.documentId, this.tenantId));
            return IncomingMessageOrder.Gap;
        } else {
            const dupDetectionMsg = `Duplicate ${clientId}:${expectedClientSequenceNumber} < ${clientSequenceNumber}`;
            this.context.log?.info(dupDetectionMsg, { messageMetaData });
            Lumberjack.info(dupDetectionMsg, getLumberBaseProperties(this.documentId, this.tenantId));
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
            const errorMsg = `Could not send message to alfred`;
            this.context.log?.error(
                `${errorMsg}: ${JSON.stringify(error)}`,
                {
                    messageMetaData: {
                        documentId: this.documentId,
                        tenantId: this.tenantId,
                    },
                });
            Lumberjack.error(errorMsg, getLumberBaseProperties(this.documentId, this.tenantId), error);
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
     */
    private updateCheckpointMessages(rawMessage: IQueuedMessage) {
        this.checkpointInfo.currentDeliCheckpointMessage = rawMessage;

        if (this.noActiveClients) {
            // If noActiveClients is set, that means we sent a NoClient message
            // so we should checkpoint the current message/offset

            // we need to explicitly set nextKafkaCheckpointMessage to undefined!
            // because once we checkpoint the current message, DocumentContext.hasPendingWork() will be false
            // that means that the partition will keep checkpointing since this lambda is up to date
            // if we don't clear nextKafkaCheckpointMessage,
            // it will try to checkpoint that old message offset once the next message arrives
            this.checkpointInfo.nextKafkaCheckpointMessage = undefined;

            this.checkpointInfo.currentKafkaCheckpointMessage = rawMessage;
        } else {
            // Keep the kafka checkpoint behind by 1 message until there are no active clients
            const kafkaCheckpointMessage = this.checkpointInfo.nextKafkaCheckpointMessage;
            this.checkpointInfo.nextKafkaCheckpointMessage = rawMessage;
            this.checkpointInfo.currentKafkaCheckpointMessage = kafkaCheckpointMessage;
        }
    }

    /**
     * Generates a checkpoint for the current state
     */
    private generateCheckpoint(reason: DeliCheckpointReason): ICheckpointParams {
        return {
            reason,
            deliState: this.generateDeliCheckpoint(),
            deliCheckpointMessage: this.checkpointInfo.currentDeliCheckpointMessage as IQueuedMessage,
            kafkaCheckpointMessage: this.checkpointInfo.currentKafkaCheckpointMessage,
        };
    }

    private generateDeliCheckpoint(): IDeliState {
        return {
            clients: this.clientSeqManager.cloneValues(),
            durableSequenceNumber: this.durableSequenceNumber,
            epoch: this.epoch,
            expHash1: this.lastHash,
            logOffset: this.logOffset,
            sequenceNumber: this.sequenceNumber,
            term: this.term,
            lastSentMSN: this.lastSentMSN,
            nackMessages: Array.from(this.nackMessages),
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

        this.opEvent.idleTimer = setTimeout(() => {
            this.emitOpEvent(OpEventType.Idle);
        }, idleTime);
    }

    private clearOpIdleTimer() {
        if (this.opEvent.idleTimer !== undefined) {
            clearTimeout(this.opEvent.idleTimer);
            this.opEvent.idleTimer = undefined;
        }
    }

    /**
     * Resets the op event MaxTime timer
     * Called after an opEvent is emitted
     */
    private updateOpMaxTimeTimer() {
        const maxTime = this.serviceConfiguration.deli.opEvent.maxTime;
        if (maxTime === undefined) {
            return;
        }

        this.clearOpMaxTimeTimer();

        this.opEvent.maxTimer = setTimeout(() => {
            this.emitOpEvent(OpEventType.MaxTime);
        }, maxTime);
    }

    private clearOpMaxTimeTimer() {
        if (this.opEvent.maxTimer !== undefined) {
            clearTimeout(this.opEvent.maxTimer);
            this.opEvent.maxTimer = undefined;
        }
    }

    /**
     * Emits an opEvent for the provided type
     * Also resets the MaxTime timer
     */
    private emitOpEvent(type: OpEventType, force?: boolean) {
        if (!force && this.opEvent.sequencedMessagesSinceLastOpEvent === 0) {
            // no need to emit since no messages were handled since last time
            return;
        }

        this.emit("opEvent", type, this.sequenceNumber, this.opEvent.sequencedMessagesSinceLastOpEvent);

        this.opEvent.sequencedMessagesSinceLastOpEvent = 0;

        this.updateOpMaxTimeTimer();
    }

    /**
     * Checks if the nackMessages flag should be reset
     */
    private checkNackMessagesState() {
        if (this.serviceConfiguration.deli.summaryNackMessages.enable &&
            this.nackMessages.has(NackMessagesType.SummaryMaxOps)) {
            // Deli is nacking messages due to summary max ops
            // Check if this new dsn gets it out of that state
            const opsSinceLastSummary = this.sequenceNumber - this.durableSequenceNumber;
            if (opsSinceLastSummary <= this.serviceConfiguration.deli.summaryNackMessages.maxOps) {
                // stop nacking future messages
                this.nackMessages.delete(NackMessagesType.SummaryMaxOps);
            }
        }
    }

    /**
     * Determines a checkpoint reason based on some heuristics
     * @returns a reason when it's time to checkpoint, or undefined if no checkpoint should be made
     */
    private getCheckpointReason(): DeliCheckpointReason | undefined {
        const checkpointHeuristics = this.serviceConfiguration.deli.checkpointHeuristics;
        if (!checkpointHeuristics.enable) {
            // always checkpoint since heuristics are disabled
            return DeliCheckpointReason.EveryMessage;
        }

        if (this.checkpointInfo.rawMessagesSinceCheckpoint >= checkpointHeuristics.maxMessages) {
            // exceeded max messages since last checkpoint
            return DeliCheckpointReason.MaxMessages;
        }

        if ((Date.now() - this.checkpointInfo.lastCheckpointTime) >= checkpointHeuristics.maxTime) {
            // exceeded max time since last checkpoint
            return DeliCheckpointReason.MaxTime;
        }

        if (this.lastInstruction === InstructionType.ClearCache) {
            // last instruction is for clearing the cache
            // checkpoint now to ensure that happens
            return DeliCheckpointReason.ClearCache;
        }

        return undefined;
    }

    /**
     * Checkpoints the current state once the pending kafka messages are produced
     */
    private checkpoint(reason: DeliCheckpointReason) {
        this.clearCheckpointIdleTimer();

        this.checkpointInfo.lastCheckpointTime = Date.now();
        this.checkpointInfo.rawMessagesSinceCheckpoint = 0;

        const checkpointParams = this.generateCheckpoint(reason);

        Promise.all([this.lastSendP, this.lastNoClientP]).then(
            () => {
                if (reason === DeliCheckpointReason.ClearCache) {
                    checkpointParams.clear = true;
                }
                void this.checkpointContext.checkpoint(checkpointParams);
            },
            (error) => {
                const errorMsg = `Could not send message to scriptorium`;
                this.context.log?.error(
                    `${errorMsg}: ${JSON.stringify(error)}`,
                    {
                        messageMetaData: {
                            documentId: this.documentId,
                            tenantId: this.tenantId,
                        },
                    });
                Lumberjack.error(errorMsg, getLumberBaseProperties(this.documentId, this.tenantId), error);
                this.context.error(error, {
                    restart: true,
                    tenantId: this.tenantId,
                    documentId: this.documentId,
                });
            });
    }

    /**
     * Updates the time until the state is checkpointed when idle
     * @param rawMessage The current raw message that is initiating the timer
     */
    private updateCheckpointIdleTimer() {
        this.clearCheckpointIdleTimer();

        const initialDeliCheckpointMessage = this.checkpointInfo.currentDeliCheckpointMessage;

        this.checkpointInfo.idleTimer = setTimeout(() => {
            this.checkpointInfo.idleTimer = undefined;

            // verify that the current deli message matches the raw message that kicked off this timer
            // if it matches, that means that delis state is for the raw message
            // this means our checkpoint will result in the correct state
            if (initialDeliCheckpointMessage === this.checkpointInfo.currentDeliCheckpointMessage) {
                this.checkpoint(DeliCheckpointReason.IdleTime);
            }
        }, this.serviceConfiguration.deli.checkpointHeuristics.idleTime);
    }

    /**
     * Clears the timer used for checkpointing when deli is idle
     */
    private clearCheckpointIdleTimer() {
        if (this.checkpointInfo.idleTimer !== undefined) {
            clearTimeout(this.checkpointInfo.idleTimer);
            this.checkpointInfo.idleTimer = undefined;
        }
    }
}
