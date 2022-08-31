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
    ISignalMessage,
    ISummaryAck,
    IDocumentMessage,
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
    ITicketedSignalMessage,
    IPartitionLambda,
    IProducer,
    IRawOperationMessage,
    ISequencedOperationMessage,
    IServiceConfiguration,
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
    SignalOperationType,
    ITicketedMessage,
    IExtendClientControlMessageContents,
    ISequencedSignalClient,
    IClientManager,
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
import {
    logCommonSessionEndMetrics,
    createSessionMetric,
    createRoomJoinMessage,
    createRoomLeaveMessage,
} from "../utils";
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

enum TicketType {
    Sequenced,
    Nack,
    Signal,
}

type TicketedMessageOutput = ISequencedDocumentMessageOutput | INackMessageOutput | ISignalMessageOutput;

interface IBaseTicketedMessage<T> {
    ticketType: TicketType;
    message: T;
    instruction?: InstructionType;
}

interface ISequencedDocumentMessageOutput extends IBaseTicketedMessage<ISequencedDocumentMessage> {
    ticketType: TicketType.Sequenced;
    send: SendType;
    type: string;

    timestamp: number;
    msn: number;
}

interface INackMessageOutput extends IBaseTicketedMessage<INackMessage> {
    ticketType: TicketType.Nack;
}

interface ISignalMessageOutput extends IBaseTicketedMessage<ITicketedSignalMessage> {
    ticketType: TicketType.Signal;
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
    /**
     * There have been no sequenced ops for X milliseconds since the last message.
     */
    Idle,

    /**
     * More than X amount of ops have been ticketed since the emit.
     */
    MaxOps,

    /**
     * There was no previous emit for the last X milliseconds.
     */
    MaxTime,

    /**
     * Indicates the durable sequence number was updated.
     */
    UpdatedDurableSequenceNumber,
}

export interface IDeliLambdaEvents extends IEvent {
    /**
     * Emitted when certain op event heuristics are triggered.
     */
    (event: "opEvent",
        listener: (type: OpEventType, sequenceNumber: number, sequencedMessagesSinceLastOpEvent: number) => void);

    /**
     * Emitted when the lambda is updating the durable sequence number.
     * This usually occurs via a control message after a summary was created.
     */
    (event: "updatedDurableSequenceNumber", listener: (durableSequenceNumber: number) => void);

    /**
     * Emitted when the lambda is updating a nack message
     */
    (event: "updatedNackMessages",
        listener: (type: NackMessagesType, contents: INackMessagesControlMessageContents | undefined) => void);

    /**
     * Emitted when the lambda receives a summarize message.
     */
    (event: "summarizeMessage", listener: (summarizeMessage: ISequencedDocumentAugmentedMessage) => void);

    /**
     * Emitted when the lambda receives a custom control message.
     */
    (event: "controlMessage", listener: (controlMessage: IControlMessage) => void);

    /**
     * Emitted when the lambda is closing.
     */
    (event: "close", listener: (type: LambdaCloseType) => void);
}

export class DeliLambda extends TypedEventEmitter<IDeliLambdaEvents> implements IPartitionLambda {
    private sequenceNumber: number;
    private signalClientConnectionNumber: number;
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
    private lastInstruction: InstructionType | undefined = InstructionType.NoOp;

    private activityIdleTimer: any;
    private readClientIdleTimer: any;
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

    private closed: boolean = false;

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
        private readonly clientManager: IClientManager | undefined,
        private readonly deltasProducer: IProducer,
        private readonly signalsProducer: IProducer | undefined,
        private readonly rawDeltasProducer: IProducer,
        private readonly serviceConfiguration: IServiceConfiguration,
        private sessionMetric: Lumber<LumberEventName.SessionResult> | undefined,
        private sessionStartMetric: Lumber<LumberEventName.StartSessionResult> | undefined,
        private readonly sequencedSignalClients: Map<string, ISequencedSignalClient> = new Map()) {
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
        this.signalClientConnectionNumber = lastCheckpoint.signalClientConnectionNumber ?? 0;
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

        this.setReadClientIdleTimer();

        if (this.serviceConfiguration.deli.opEvent.enable) {
            this.updateOpMaxTimeTimer();

            /**
             * Deli's opEvent system is supposed to tell us when it's time to post ops for the session.
             * It sends an "opEvent" event based heuristics like idle / max time / max ops.
             * There's an edge case though. Suppose the following:
             * 1. Server A created a deli for the session, consumes 100 kafka messages, and sequences 100 ops.
             * 2. Within 5 seconds of sequencing those ops,
             *  Server A's deli saves a checkpoint (it remembers it sequenced those 100 ops)
             * 3. Within a second of that checkpoint, the Kafka partition is rebalanced.
             * 4. Server B now creates a deli for that session and it consumes those same 100 kafka messages.
             * 4a. Server B's deli instance is smart enough to detect that those 100 kafka messages were already
             *  processed (due to the checkpoint created in #2) so it ignores them (the first if statement in handler).
             *
             * The above flow is a problem because the opEvent logic is not going to trigger since
             *  no messages were sequenced by this deli.
             *
             * Deli should be smart and check if it hasn't yet sent an opEvent for messages that
             * were not durably stored.
             */
            if (this.sequenceNumber > this.durableSequenceNumber) {
                /**
                 * This makes it so the next time deli checks for a "maxTime" opEvent,
                 * it will fire the event since sequencedMessagesSinceLastOpEvent \> 0.
                 */
                this.opEvent.sequencedMessagesSinceLastOpEvent = this.sequenceNumber - this.durableSequenceNumber;
            }
        }

        this.isNewDocument = this.sequenceNumber === 0;

        if (serviceConfiguration.enableLumberjack) {
            this.logSessionStartMetrics();
        }

        if (this.serviceConfiguration.deli.checkForIdleClientsOnStartup) {
            /**
             * Instruct deli to check for idle clients on startup. Why do we want to do this?
             *
             * Suppose the following:
             * 1. Deli starts up and there is 1 write client and it
             * consumes 1 message it has already previouly consumed.
             * 2. Deli is closed due to a rebalance 2 minutes later.
             * 3. Suppose that deli keeps rebalancing every 2 minutes indefinitely.
             *
             * Deli is configured to checkpoint 1 message behind the head while there is a client in the session.
             * This will cause the kafka partition to never get a new checkpoint because it's in this bad loop.
             * Never checkpointing could eventually lead to messages expiring from Kafka (data loss/corruption).
             *
             * We can recover from this loop if we check for idle clients on startup and insert a leave message
             * for that 1 write client (who is now definitely expired). It would end up making deli checkpoint properly.
             */
            this.checkIdleWriteClients(Date.now());
        }
    }

    public handler(rawMessage: IQueuedMessage) {
        // In cases where we are reprocessing messages we have already checkpointed exit early
        if (rawMessage.offset <= this.logOffset) {
            Lumberjack.info(`rawMessage.offset: ${rawMessage.offset} <= this.logOffset: ${this.logOffset}`,
                getLumberBaseProperties(this.documentId, this.tenantId));

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
            const ticketedMessage = this.ticket(
                message,
                this.serviceConfiguration.enableTraces ? this.createTrace("start") : undefined);

            // Return early if message is invalid
            if (!ticketedMessage) {
                continue;
            }

            this.lastInstruction = ticketedMessage.instruction;

            switch (ticketedMessage.ticketType) {
                case TicketType.Sequenced: {
                    if (ticketedMessage.type !== MessageType.ClientLeave) {
                        // Check for idle write clients.
                        this.checkIdleWriteClients(ticketedMessage.timestamp);
                    }

                    // Check for document inactivity.
                    if (!(ticketedMessage.type === MessageType.NoClient || ticketedMessage.type === MessageType.Control)
                        && this.noActiveClients) {
                        this.lastNoClientP = this.sendToRawDeltas(this.createOpMessage(MessageType.NoClient))
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
                                Lumberjack.error(
                                    errorMsg,
                                    getLumberBaseProperties(this.documentId, this.tenantId), error);
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

                    const sequencedMessage = ticketedMessage.message;

                    if (this.serviceConfiguration.deli.enableOpHashing) {
                        this.lastHash = getNextHash(sequencedMessage, this.lastHash);
                        sequencedMessage.expHash1 = this.lastHash;
                    }

                    if (sequencedMessage.type === MessageType.Summarize) {
                        // note: this is being emitted before it's produced to the deltas topic
                        // that lets event handlers alter the message if necessary
                        this.emit("summarizeMessage", sequencedMessage as ISequencedDocumentAugmentedMessage);
                    }

                    const outgoingMessage: ISequencedOperationMessage = {
                        type: SequencedOperationType,
                        tenantId: this.tenantId,
                        documentId: this.documentId,
                        operation: sequencedMessage,
                    };

                    this.produceMessage(this.deltasProducer, outgoingMessage);

                    sequencedMessageCount++;

                    // Update the msn last sent
                    this.lastSentMSN = ticketedMessage.msn;

                    // create a signal for a write client if all the following are true:
                    // 1. a signal producer is provided
                    // 2. the sequenced op is a join or leave message
                    // 3. enableWriteClientSignals is on or alfred told us to create a signal
                    // #3 allows alfred to be in charge of enabling this functionality
                    if (this.signalsProducer &&
                        (sequencedMessage.type === MessageType.ClientJoin ||
                            sequencedMessage.type === MessageType.ClientLeave) &&
                        (this.serviceConfiguration.deli.enableWriteClientSignals ||
                            (sequencedMessage.serverMetadata &&
                                typeof (sequencedMessage.serverMetadata) === "object" &&
                                sequencedMessage.serverMetadata.createSignal))) {
                        const dataContent = this.extractDataContent(message as IRawOperationMessage);

                        const signalMessage = this.createSignalMessage(
                            message as IRawOperationMessage,
                            sequencedMessage.sequenceNumber - 1,
                            dataContent);

                        if (sequencedMessage.type === MessageType.ClientJoin) {
                            this.addSequencedSignalClient(dataContent as IClientJoin, signalMessage);
                        } else {
                            this.sequencedSignalClients.delete(dataContent);
                        }

                        this.produceMessage(this.signalsProducer, signalMessage.message);
                    }

                    break;
                }

                case TicketType.Nack: {
                    this.produceMessage(this.deltasProducer, ticketedMessage.message);
                    break;
                }

                case TicketType.Signal: {
                    if (this.signalsProducer) {
                        this.produceMessage(this.signalsProducer, ticketedMessage.message);
                    }
                    break;
                }

                default:
                    // ignore unknown types
                    break;
            }
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

        if (sequencedMessageCount > 0) {
            // Check if Deli is over the max ops since last summary nack limit
            // Note: we are explicitly checking this after processing the entire boxcar in order to not break batches
            if (this.serviceConfiguration.deli.summaryNackMessages.enable &&
                !this.nackMessages.has(NackMessagesType.SummaryMaxOps)) {
                const opsSinceLastSummary = this.sequenceNumber - this.durableSequenceNumber;
                if (opsSinceLastSummary > this.serviceConfiguration.deli.summaryNackMessages.maxOps) {
                    // this op brings us over the limit
                    // start nacking non-system ops and ops that are submitted by non-summarizers
                    this.updateNackMessages(NackMessagesType.SummaryMaxOps, {
                        identifier: NackMessagesType.SummaryMaxOps,
                        content: this.serviceConfiguration.deli.summaryNackMessages.nackContent,
                        allowSystemMessages: true,
                        allowedScopes: [ScopeType.SummaryWrite],
                    });
                }
            }

            // Update the op event idle & max ops counter if ops were just sequenced
            if (this.serviceConfiguration.deli.opEvent.enable) {
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
    }

    public close(closeType: LambdaCloseType) {
        this.closed = true;

        this.checkpointContext.close();

        this.clearActivityIdleTimer();
        this.clearReadClientIdleTimer();
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

    private produceMessage(producer: IProducer, message: ITicketedMessage) {
        this.lastSendP = producer
            .send([message], message.tenantId, message.documentId)
            .catch((error) => {
                if (this.closed) {
                    return;
                }

                const errorMsg = "Could not send message to producer";
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

    private ticket(rawMessage: IMessage, trace: ITrace | undefined): TicketedMessageOutput | undefined {
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
                if (!this.clientSeqManager.removeClient(dataContent)) {
                    // not a write client. check if it was a read client
                    const readClient = this.sequencedSignalClients.get(dataContent);
                    if (readClient) {
                        this.sequencedSignalClients.delete(dataContent);
                        return this.createSignalMessage(message, this.sequenceNumber, dataContent);
                    }

                    // Return if the client has already been removed due to a prior leave message.
                    return;
                }
            } else if (message.operation.type === MessageType.ClientJoin) {
                const clientJoinMessage = dataContent as IClientJoin;

                if (clientJoinMessage.detail.mode === "read") {
                    if (this.sequencedSignalClients.has(clientJoinMessage.clientId)) {
                        // Return if the client has already been added due to a prior join message.
                        return;
                    }

                    // create the signal message
                    const signalMessage = this.createSignalMessage(message, this.sequenceNumber, dataContent);

                    this.addSequencedSignalClient(clientJoinMessage, signalMessage);

                    return signalMessage;
                } else {
                    const isNewClient = this.clientSeqManager.upsertClient(
                        clientJoinMessage.clientId,
                        0,
                        this.minimumSequenceNumber,
                        message.timestamp,
                        true,
                        clientJoinMessage.detail.scopes,
                        false,
                        message.operation.serverMetadata);
                    if (!isNewClient) {
                        // Return if the client has already been added due to a prior join message.
                        return;
                    }
                }
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

        let sequenceNumber = this.sequenceNumber;

        // Get the current sequence number and increment it if appropriate.
        // We don't increment sequence number for noops sent by client since they will
        // be consolidated and sent later as raw message.
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

        /**
         * Run extra logic depending on the op type
         */
        switch (message.operation.type) {
            /**
             * Sequence number was never rev'd for NoOps. We will decide now based on heuristics.
             */
            case MessageType.NoOp: {
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
                break;
            }

            /**
             * Sequence number was never rev'd for noClients. We will decide now based on heuristics.
             */
            case MessageType.NoClient: {
                // Only rev if no clients have shown up since last noClient was sent to alfred.
                if (this.noActiveClients) {
                    sequenceNumber = this.revSequenceNumber();
                    message.operation.referenceSequenceNumber = sequenceNumber;
                    this.minimumSequenceNumber = sequenceNumber;
                } else {
                    sendType = SendType.Never;
                }

                break;
            }

            case MessageType.Control: {
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
                            // Deli cache is only cleared when no clients have
                            // joined since last noClient was sent to alfred
                            if (controlContents.clearCache && this.noActiveClients) {
                                instruction = InstructionType.ClearCache;
                                const deliCacheMsg = `Deli cache will be cleared`;
                                this.context.log?.info(deliCacheMsg, {
                                    messageMetaData: {
                                        documentId: this.documentId,
                                        tenantId: this.tenantId,
                                    },
                                });
                                Lumberjack.info(deliCacheMsg, getLumberBaseProperties(this.documentId, this.tenantId));
                            }

                            this.updateDurableSequenceNumber(dsn);
                        }

                        break;
                    }

                    case ControlMessageType.NackMessages: {
                        const controlContents: INackMessagesControlMessageContents |
                            IDisableNackMessagesControlMessageContents = controlMessage.contents;

                        this.updateNackMessages(
                            controlContents.identifier,
                            controlContents.content !== undefined ? controlContents : undefined);

                        break;
                    }

                    case ControlMessageType.LambdaStartResult: {
                        const controlContents = controlMessage.contents as ILambdaStartControlMessageContents;

                        if (controlContents.success) {
                            this.successfullyStartedLambdas.push(controlContents.lambdaName);
                        }

                        this.logSessionStartMetrics(!controlContents.success);
                        break;
                    }

                    case ControlMessageType.ExtendClient: {
                        const controlContents = controlMessage.contents as IExtendClientControlMessageContents;

                        const clientsToExtend: Map<string, ISequencedSignalClient> = new Map();

                        const clientIds = controlContents.clientIds ??
                            (controlContents.clientId ? [controlContents.clientId] : []);
                        for (const clientId of clientIds) {
                            const client = this.sequencedSignalClients.get(clientId);
                            if (client) {
                                clientsToExtend.set(clientId, client);
                            }
                        }

                        if (clientsToExtend.size > 0) {
                            if (this.clientManager) {
                                this.clientManager.extendSequencedClients(
                                    this.tenantId,
                                    this.documentId,
                                    clientsToExtend,
                                    this.serviceConfiguration.deli.clientTimeout)
                                    .catch((error) => {
                                        const errorMsg = "Could not extend clients";
                                        this.context.log?.error(
                                            `${errorMsg}: ${JSON.stringify(error)}`,
                                            {
                                                messageMetaData: {
                                                    documentId: this.documentId,
                                                    tenantId: this.tenantId,
                                                },
                                            });
                                        Lumberjack.error(
                                            errorMsg,
                                            getLumberBaseProperties(this.documentId, this.tenantId), error);
                                    });
                            } else {
                                const errorMsg = "Could not extend clients. Missing client manager";
                                this.context.log?.error(
                                    `${errorMsg}`,
                                    {
                                        messageMetaData: {
                                            documentId: this.documentId,
                                            tenantId: this.tenantId,
                                        },
                                    });
                                Lumberjack.error(
                                    errorMsg,
                                    getLumberBaseProperties(this.documentId, this.tenantId));
                            }
                        }

                        break;
                    }

                    default:
                        // an unknown control message was received
                        // emit a control message event to support custom control messages
                        this.emit("controlMessage", controlMessage);
                        break;
                }

                break;
            }

            /**
             * Automatically update the DSN when sequencing a summaryAck
             */
            case MessageType.SummaryAck: {
                if (this.serviceConfiguration.deli.enableAutoDSNUpdate) {
                    const dsn = (dataContent as ISummaryAck).summaryProposal.summarySequenceNumber;
                    if (dsn >= this.durableSequenceNumber) {
                        this.updateDurableSequenceNumber(dsn);
                    }
                }

                break;
            }

            default:
                break;
        }

        // Add traces
        if (trace && message.operation.traces && message.operation.traces.length > 1) {
            message.operation.traces.push(trace);
            message.operation.traces.push(this.createTrace("end"));
        }

        // craft the output message
        const outputMessage = this.createOutputMessage(message, undefined /* origin */, sequenceNumber, dataContent);

        return {
            ticketType: TicketType.Sequenced,
            instruction,
            message: outputMessage,
            msn: this.minimumSequenceNumber,
            send: sendType,
            timestamp: message.timestamp,
            type: message.operation.type,
        };
    }

    private extractDataContent(message: IRawOperationMessage) {
        if (message.operation.type === MessageType.ClientJoin ||
            message.operation.type === MessageType.ClientLeave ||
            message.operation.type === MessageType.SummaryAck ||
            message.operation.type === MessageType.SummaryNack ||
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
        dataContent: any,
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
        } else if (dataContent !== undefined) { // TODO to consolidate the logic here
            const systemOutputMessage = outputMessage as ISequencedDocumentSystemMessage;
            systemOutputMessage.data = JSON.stringify(dataContent);
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

    /**
     * Sends a message to the rawdeltas queue.
     * This essentially sends the message to this deli lambda
     */
    private async sendToRawDeltas(message: IRawOperationMessage) {
        try {
            await this.rawDeltasProducer.send([message], message.tenantId, message.documentId);
        } catch (error) {
            if (this.closed) {
                return;
            }

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

    /**
     * Check if there are any old/idle write clients.
     * Craft and send a leave message if one is found.
     * To prevent recurrent leave message sending, leave messages are only piggybacked with other message type.
     */
    private checkIdleWriteClients(timestamp: number) {
        const idleClient = this.getIdleClient(timestamp);
        if (idleClient?.clientId) {
            const leaveMessage = this.createLeaveMessage(idleClient.clientId, idleClient.serverMetadata);
            void this.sendToRawDeltas(leaveMessage);
        }
    }

    /**
     * Check if there are any expired read clients.
     * The read client will expire if alfred has not sent
     * an ExtendClient control message within the time for 'clientTimeout'.
     * Craft and send a leave message for each one found.
     */
    private checkIdleReadClients() {
        const currentTime = Date.now();

        for (const [clientId, { client, exp }] of this.sequencedSignalClients) {
            // only handle read clients here
            // write client idle is handled by checkIdleWriteClients
            if (client.mode === "read" && exp < currentTime) {
                const leaveMessage = this.createLeaveMessage(clientId);
                void this.sendToRawDeltas(leaveMessage);
            }
        }
    }

    /**
     * Creates a leave message for inactive clients.
     */
    private createLeaveMessage(clientId: string, serverMetadata?: any): IRawOperationMessage {
        const leaveMessage: IDocumentSystemMessage = {
            clientSequenceNumber: -1,
            contents: null,
            data: JSON.stringify(clientId),
            referenceSequenceNumber: -1,
            traces: this.serviceConfiguration.enableTraces ? [] : undefined,
            type: MessageType.ClientLeave,
            serverMetadata,
        };
        return this.createRawOperationMessage(leaveMessage);
    }

    /**
     * Creates a nack message for clients.
     */
    private createNackMessage(
        message: IRawOperationMessage,
        code: number,
        type: NackErrorType,
        reason: string,
        retryAfter?: number): INackMessageOutput | undefined {
        const clientId = message.clientId;
        if (!clientId) {
            // message was sent by the system and not a client
            // "nacking" the system is not supported
            return undefined;
        }

        const nackMessage: INackMessage = {
            clientId,
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
            ticketType: TicketType.Nack,
            message: nackMessage,
        };
    }

    /**
     * Creates a signal message for clients.
     */
    private createSignalMessage(
        message: IRawOperationMessage,
        sequenceNumber: number,
        dataContent: any): ISignalMessageOutput {
        let signalMessage: ISignalMessage;

        switch (message.operation.type) {
            case MessageType.ClientJoin:
                signalMessage = createRoomJoinMessage(
                    (dataContent as IClientJoin).clientId,
                    (dataContent as IClientJoin).detail);
                break;

            case MessageType.ClientLeave:
                signalMessage = createRoomLeaveMessage(
                    typeof (dataContent) === "string" ? dataContent : dataContent.clientId);
                break;

            case MessageType.Control:
                // this will tell broadcaster to process the control message the client
                signalMessage = {
                    clientId: null,
                    content: JSON.stringify({
                        type: MessageType.Control,
                        content: dataContent,
                    }),
                };
                break;

            default:
                throw new Error(`Cannot create signal message for type ${message.operation.type}`);
        }

        (signalMessage as any).referenceSequenceNumber = sequenceNumber;
        (signalMessage as any).clientConnectionNumber = ++this.signalClientConnectionNumber;

        return {
            ticketType: TicketType.Signal,
            message: {
                type: SignalOperationType,
                tenantId: this.tenantId,
                documentId: this.documentId,
                operation: signalMessage,
                timestamp: Date.now(),
            },
        };
    }

    private createOpMessage(type: string): IRawOperationMessage {
        return this.createRawOperationMessage({
            clientSequenceNumber: -1,
            contents: null,
            referenceSequenceNumber: -1,
            traces: this.serviceConfiguration.enableTraces ? [] : undefined,
            type,
        });
    }

    private createRawOperationMessage(operation: IDocumentMessage): IRawOperationMessage {
        return {
            clientId: null,
            documentId: this.documentId,
            operation,
            tenantId: this.tenantId,
            timestamp: Date.now(),
            type: RawOperationType,
        };
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
            signalClientConnectionNumber: this.signalClientConnectionNumber,
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
        if (client?.canEvict &&
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
                void this.sendToRawDeltas(noOpMessage);
            }
        }, this.serviceConfiguration.deli.activityTimeout);
    }

    private clearActivityIdleTimer() {
        if (this.activityIdleTimer !== undefined) {
            clearTimeout(this.activityIdleTimer);
            this.activityIdleTimer = undefined;
        }
    }

    private setReadClientIdleTimer() {
        this.clearReadClientIdleTimer();

        this.readClientIdleTimer = setInterval(() => {
            this.checkIdleReadClients();
        }, this.serviceConfiguration.deli.readClientIdleTimer);
    }

    private clearReadClientIdleTimer() {
        if (this.readClientIdleTimer !== undefined) {
            clearInterval(this.readClientIdleTimer);
            this.readClientIdleTimer = undefined;
        }
    }

    private setNoopConsolidationTimer() {
        if (this.noActiveClients) {
            return;
        }
        this.noopEvent = setTimeout(() => {
            if (!this.noActiveClients) {
                const noOpMessage = this.createOpMessage(MessageType.NoOp);
                void this.sendToRawDeltas(noOpMessage);
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
                this.updateNackMessages(NackMessagesType.SummaryMaxOps, undefined);
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
     * @param rawMessage - The current raw message that is initiating the timer
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

    /**
     * Updates the durable sequence number
     * @param dsn - New durable sequence number
     */
    private updateDurableSequenceNumber(dsn: number) {
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

    /**
     * Adds/updates/removes a nack message
     * @param type - Nack message type
     * @param contents - Nack messages contents or undefined to delete the nack message
     */
    private updateNackMessages(type: NackMessagesType, contents: INackMessagesControlMessageContents | undefined) {
        if (contents !== undefined) {
            this.nackMessages.set(type, contents);
        } else {
            this.nackMessages.delete(type);
        }

        this.emit("updatedNackMessages", type, contents);
    }

    /**
     * Adds a sequenced signal client to the in-memory map.
     * Alfred will periodically send ExtendClient control messages, which will extend the client expiration times.
     * @param clientJoinMessage - Client join message (from dataContent)
     * @param signalMessage - Ticketed join signal message
     */
    private addSequencedSignalClient(clientJoinMessage: IClientJoin, signalMessage: ISignalMessageOutput) {
        const sequencedSignalClient: ISequencedSignalClient = {
            client: clientJoinMessage.detail,
            referenceSequenceNumber: (signalMessage.message.operation as any).referenceSequenceNumber,
            clientConnectionNumber: (signalMessage.message.operation as any).clientConnectionNumber,
            exp: Date.now() + this.serviceConfiguration.deli.clientTimeout,
        };

        this.sequencedSignalClients.set(clientJoinMessage.clientId, sequencedSignalClient);
    }
}
