/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable no-null/no-null */

import assert from "assert";
import { inspect } from "util";
import { ProtocolOpHandler } from "@fluidframework/protocol-base";
import {
    IDocumentMessage,
    IDocumentSystemMessage,
    ISequencedDocumentMessage,
    ISummaryAck,
    ISummaryNack,
    MessageType,
    ISequencedDocumentAugmentedMessage,
    IProtocolState,
    ScopeType,
} from "@fluidframework/protocol-definitions";
import {
    ControlMessageType,
    extractBoxcar,
    IContext,
    IControlMessage,
    IProducer,
    IRawOperationMessage,
    IScribe,
    ISequencedOperationMessage,
    IServiceConfiguration,
    RawOperationType,
    SequencedOperationType,
    IQueuedMessage,
    IPartitionLambda,
    INackMessagesControlMessageContents,
} from "@fluidframework/server-services-core";
import { BaseTelemetryProperties, CommonProperties,
    Lumber,
    LumberEventName, Lumberjack } from "@fluidframework/server-services-telemetry";
import Deque from "double-ended-queue";
import * as _ from "lodash";
import { setQueuedMessageProperties } from "../utils";
import { ICheckpointManager, IPendingMessageReader, ISummaryReader, ISummaryWriter } from "./interfaces";
import { initializeProtocol } from "./utils";

export class ScribeLambda implements IPartitionLambda {
    // Value of the last processed Kafka offset
    private lastOffset: number;

    // Pending checkpoint information
    private pendingCheckpointScribe: IScribe | undefined;
    private pendingCheckpointOffset: IQueuedMessage | undefined;
    private pendingP: Promise<void> | undefined;
    private readonly pendingCheckpointMessages = new Deque<ISequencedOperationMessage>();

    // Messages not yet processed by protocolHandler
    private pendingMessages: Deque<ISequencedDocumentMessage>;

    // Current sequence/msn of the last processed offset
    private sequenceNumber = 0;
    private minSequenceNumber = 0;

    // Ref of the last client generated summary
    private lastClientSummaryHead: string | undefined;

    // Indicates whether cache needs to be cleaned after processing a message
    private clearCache: boolean = false;

    // Indicates if the lambda was closed
    private closed: boolean = false;

    constructor(
        protected readonly context: IContext,
        protected tenantId: string,
        protected documentId: string,
        private readonly summaryWriter: ISummaryWriter,
        private readonly summaryReader: ISummaryReader,
        private readonly pendingMessageReader: IPendingMessageReader | undefined,
        private readonly checkpointManager: ICheckpointManager,
        scribe: IScribe,
        private readonly serviceConfiguration: IServiceConfiguration,
        private readonly producer: IProducer | undefined,
        private protocolHandler: ProtocolOpHandler,
        private term: number,
        private protocolHead: number,
        messages: ISequencedDocumentMessage[],
    ) {
        this.lastOffset = scribe.logOffset;
        this.setStateFromCheckpoint(scribe);
        this.pendingMessages = new Deque<ISequencedDocumentMessage>(messages);
    }

    public async handler(message: IQueuedMessage) {
        const lumberJackMetric = this.serviceConfiguration.enableLumberTelemetryFramework ?
            Lumberjack.newLumberMetric(LumberEventName.ScribeHandler) : undefined;

        if (lumberJackMetric)
        {
            lumberJackMetric.setProperties({
                [BaseTelemetryProperties.tenantId]: this.tenantId,
                [BaseTelemetryProperties.documentId]: this.documentId,
            });

            setQueuedMessageProperties(message, lumberJackMetric);
        }

        // Skip any log messages we have already processed. Can occur in the case Kafka needed to restart but
        // we had already checkpointed at a given offset.
        if (message.offset <= this.lastOffset) {
            this.context.checkpoint(message);

            lumberJackMetric?.success(`Already processed upto offset ${this.lastOffset}.
                Current message offset ${message.offset}`);
            return;
        }

        const boxcar = extractBoxcar(message);

        for (const baseMessage of boxcar.contents) {
            if (baseMessage.type === SequencedOperationType) {
                const value = baseMessage as ISequencedOperationMessage;

                // The following block is only invoked once deli enables term flipping.
                if (this.term && value.operation.term) {
                    if (value.operation.term < this.term) {
                        continue;
                    } else if (value.operation.term > this.term) {
                        const lastSummary = await this.summaryReader.readLastSummary();
                        if (!lastSummary.fromSummary) {
                            const errorMsg = `Required summary can't be fetched`;
                            lumberJackMetric?.error(errorMsg);
                            throw Error(errorMsg);
                        }
                        this.term = lastSummary.term;
                        const lastScribe = JSON.parse(lastSummary.scribe) as IScribe;
                        await this.updateProtocolHead(lastSummary.protocolHead);
                        this.protocolHandler = initializeProtocol(lastScribe.protocolState, this.term);
                        this.setStateFromCheckpoint(lastScribe);
                        this.pendingMessages = new Deque<ISequencedDocumentMessage>(
                            lastSummary.messages.filter(
                                (op) => op.sequenceNumber > lastScribe.protocolState.sequenceNumber));

                        this.pendingP = undefined;
                        this.pendingCheckpointScribe = undefined;
                        this.pendingCheckpointOffset = undefined;

                        await this.checkpointManager.delete(lastScribe.sequenceNumber + 1, false);
                    }
                }

                // Skip messages that were already checkpointed on a prior run.
                if (value.operation.sequenceNumber <= this.sequenceNumber) {
                    continue;
                }

                const lastProtocolHandlerSequenceNumber =
                    this.pendingMessages.peekBack()?.sequenceNumber ?? this.protocolHandler.sequenceNumber;

                // Handles a partial checkpoint case where messages were inserted into DB but checkpointing failed.
                if (value.operation.sequenceNumber <= lastProtocolHandlerSequenceNumber) {
                    continue;
                }

                // Ensure protocol handler sequence numbers are monotonically increasing
                if (value.operation.sequenceNumber !== lastProtocolHandlerSequenceNumber + 1) {
                    // unexpected sequence number. if a pending message reader is available, ask for those ops
                    if (this.pendingMessageReader !== undefined) {
                        const from = lastProtocolHandlerSequenceNumber + 1;
                        const to = value.operation.sequenceNumber - 1;
                        const additionalPendingMessages = await this.pendingMessageReader.readMessages(from, to);
                        for (const additionalPendingMessage of additionalPendingMessages) {
                            this.pendingMessages.push(additionalPendingMessage);
                        }
                    } else {
                        const errorMsg = `Invalid message sequence number.`
                            + `Current message @${value.operation.sequenceNumber}.`
                            + `ProtocolHandler @${lastProtocolHandlerSequenceNumber}`;
                        lumberJackMetric?.error(errorMsg);
                        throw new Error(errorMsg);
                    }
                }

                // Add the message to the list of pending for this document and those that we need
                // to include in the checkpoint
                this.pendingMessages.push(value.operation);

                if (this.serviceConfiguration.scribe.enablePendingCheckpointMessages) {
                    this.pendingCheckpointMessages.push(value);
                }

                // Update the current sequence and min sequence numbers
                const msnChanged = this.minSequenceNumber !== value.operation.minimumSequenceNumber;
                this.sequenceNumber = value.operation.sequenceNumber;
                this.minSequenceNumber = value.operation.minimumSequenceNumber;

                if (msnChanged) {
                    // When the MSN changes we can process up to it to save space
                    this.processFromPending(this.minSequenceNumber);
                }

                this.clearCache = false;
                if (value.operation.type === MessageType.Summarize) {
                    // Process up to the summary op ref seq to get the protocol state at the summary op.
                    // Capture state first in case the summary is nacked.
                    const prevState = {
                        protocolState: this.protocolHandler.getProtocolState(),
                        pendingOps: this.pendingMessages.toArray(),
                    };
                    this.processFromPending(value.operation.referenceSequenceNumber);

                    // Only process the op if the protocol state advances. This eliminates the corner case where we have
                    // already captured this summary and are processing this message due to a replay of the stream.
                    if (this.protocolHead < this.protocolHandler.sequenceNumber) {
                        try {
                            const scribeCheckpoint = this.generateCheckpoint(this.lastOffset);
                            const operation = value.operation as ISequencedDocumentAugmentedMessage;
                            const summaryResponse = await this.summaryWriter.writeClientSummary(
                                operation,
                                this.lastClientSummaryHead,
                                scribeCheckpoint,
                                this.pendingCheckpointMessages.toArray(),
                            );

                            // This block is only executed if the writer is not external. For an external writer,
                            // (e.g., job queue) the responsibility of sending ops to the stream is up to the
                            // external writer.
                            if (!this.summaryWriter.isExternal) {
                                // On a successful write, send an ack message to clients and a control message to deli.
                                // Otherwise send a nack and revert the protocol state back to pre summary state.
                                if (summaryResponse.status) {
                                    await this.sendSummaryAck(summaryResponse.message as ISummaryAck);
                                    await this.sendSummaryConfirmationMessage(operation.sequenceNumber, false);
                                    await this.updateProtocolHead(this.protocolHandler.sequenceNumber);
                                    lumberJackMetric?.setProperties({[CommonProperties.clientSummarySuccess]: true});
                                    this.context.log?.info(
                                        `Client summary success @${value.operation.sequenceNumber}`,
                                        {
                                            messageMetaData: {
                                                documentId: this.documentId,
                                                tenantId: this.tenantId,
                                            },
                                        },
                                    );
                                } else {
                                    const nackMessage = summaryResponse.message as ISummaryNack;
                                    await this.sendSummaryNack(nackMessage);
                                    lumberJackMetric?.setProperties({[CommonProperties.clientSummarySuccess]: false});
                                    this.context.log?.error(
                                        `Client summary failure @${value.operation.sequenceNumber}. `
                                        + `Error: ${nackMessage.errorMessage}`,
                                        {
                                            messageMetaData: {
                                                documentId: this.documentId,
                                                tenantId: this.tenantId,
                                            },
                                        },
                                    );
                                    this.revertProtocolState(prevState.protocolState, prevState.pendingOps);
                                }
                            }
                        } catch (ex) {
                            const errorMsg = `Client summary failure @${value.operation.sequenceNumber}. 
                                Exception: ${inspect(ex)}`;
                            lumberJackMetric?.setProperties({[CommonProperties.clientSummarySuccess]: false});
                            this.context.log?.error(errorMsg);
                            this.revertProtocolState(prevState.protocolState, prevState.pendingOps);
                            // If this flag is set, we should ignore any storage specific error and move forward
                            // to process the next message.
                            if (this.serviceConfiguration.scribe.ignoreStorageException) {
                                await this.sendSummaryNack(
                                    {
                                        errorMessage: "Failed to summarize the document.",
                                        summaryProposal: {
                                            summarySequenceNumber: value.operation.sequenceNumber,
                                        },
                                    },
                                );
                            } else {
                                lumberJackMetric?.error(errorMsg);
                                throw ex;
                            }
                        }
                    }
                } else if (value.operation.type === MessageType.NoClient) {
                    assert(
                        value.operation.referenceSequenceNumber === value.operation.sequenceNumber,
                        `${value.operation.referenceSequenceNumber} != ${value.operation.sequenceNumber}`);
                    assert(
                        value.operation.minimumSequenceNumber === value.operation.sequenceNumber,
                        `${value.operation.minimumSequenceNumber} != ${value.operation.sequenceNumber}`);

                    if (this.serviceConfiguration.scribe.generateServiceSummary) {
                        const operation = value.operation as ISequencedDocumentAugmentedMessage;
                        const scribeCheckpoint = this.generateCheckpoint(this.lastOffset);
                        try {
                            const summaryResponse = await this.summaryWriter.writeServiceSummary(
                                operation,
                                this.protocolHead,
                                scribeCheckpoint,
                                this.pendingCheckpointMessages.toArray(),
                            );

                            if (summaryResponse) {
                                if (this.serviceConfiguration.scribe.clearCacheAfterServiceSummary) {
                                    this.clearCache = true;
                                }
                                await this.sendSummaryConfirmationMessage(
                                    operation.sequenceNumber,
                                    this.serviceConfiguration.scribe.clearCacheAfterServiceSummary);
                                lumberJackMetric?.setProperties({[CommonProperties.serviceSummarySuccess]: true});
                                this.context.log?.info(
                                    `Service summary success @${operation.sequenceNumber}`,
                                    {
                                        messageMetaData: {
                                            documentId: this.documentId,
                                            tenantId: this.tenantId,
                                        },
                                    },
                                );
                            }
                        } catch (ex) {
                            const errorMsg = `Service summary failure @${operation.sequenceNumber}. 
                                Exception: ${inspect(ex)}`;
                            lumberJackMetric?.setProperties({[CommonProperties.serviceSummarySuccess]: false});

                            // If this flag is set, we should ignore any storage speciic error and move forward
                            // to process the next message.
                            if (this.serviceConfiguration.scribe.ignoreStorageException) {
                                this.context.log?.error(
                                    `Service summary failure @${operation.sequenceNumber}`,
                                    {
                                        messageMetaData: {
                                            documentId: this.documentId,
                                            tenantId: this.tenantId,
                                        },
                                    });
                            } else {
                                lumberJackMetric?.error(errorMsg);
                                throw ex;
                            }
                        }
                    }
                } else if (value.operation.type === MessageType.SummaryAck) {
                    const content = value.operation.contents as ISummaryAck;
                    this.lastClientSummaryHead = content.handle;
                    // An external summary writer can only update the protocolHead when the ack is sequenced
                    // back to the stream.
                    if (this.summaryWriter.isExternal) {
                        await this.updateProtocolHead(content.summaryProposal.summarySequenceNumber);
                    }
                }

                // check to see if this exact sequence number causes us to hit the max ops since last summary nack limit
                if (this.serviceConfiguration.scribe.nackMessages.enable &&
                    this.serviceConfiguration.scribe.nackMessages.maxOps === this.sequenceNumber - this.protocolHead) {
                    lumberJackMetric?.setProperties({[CommonProperties.maxOpsSinceLastSummary]: true});

                    // this op brings us over the limit
                    // tell deli to start nacking non-system ops and ops that are submitted by non-summarizers
                    await this.sendNackMessage({
                        content: this.serviceConfiguration.scribe.nackMessages.nackContent,
                        allowSystemMessages: true,
                        allowedScopes: [ScopeType.SummaryWrite],
                    });
                }
            }
        }

        const checkpoint = this.generateCheckpoint(message.offset);
        this.checkpointCore(
            checkpoint,
            message,
            this.clearCache);
        this.lastOffset = message.offset;

        if (lumberJackMetric)
        {
            this.setScribeStateMetrics(checkpoint, lumberJackMetric);
        }

        lumberJackMetric?.success(`Message processed successfully 
            at offset seq no ${checkpoint.sequenceNumber}`);
    }

    private setScribeStateMetrics(checkpoint: IScribe, lumberJackMetric: Lumber<LumberEventName.ScribeHandler>) {
        const scribeState = {
            [CommonProperties.sequenceNumber]: checkpoint.protocolState.sequenceNumber,
            [CommonProperties.minSequenceNumber]: checkpoint.protocolState.minimumSequenceNumber,
            [CommonProperties.clientCount]: checkpoint.protocolState.members.length,
            [CommonProperties.checkpointOffset]: checkpoint.logOffset,
        };
        lumberJackMetric?.setProperties(scribeState);
    }

    public close() {
        this.closed = true;
        this.protocolHandler.close();
    }

    // Advances the protocol state up to 'target' sequence number. Having an exception while running this code
    // is crucial and the document is essentially corrupted at this point. We should start logging this and
    // have a better understanding of all failure modes.
    private processFromPending(target: number) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        while (this.pendingMessages.length > 0 && this.pendingMessages.peekFront()!.sequenceNumber <= target) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const message = this.pendingMessages.shift()!;
            try {
                if (message.contents &&
                    typeof message.contents === "string" &&
                    message.type !== MessageType.ClientLeave) {
                    const clonedMessage = _.cloneDeep(message);
                    clonedMessage.contents = JSON.parse(clonedMessage.contents);
                    this.protocolHandler.processMessage(clonedMessage, false);
                } else {
                    this.protocolHandler.processMessage(message, false);
                }
            } catch (error) {
                this.context.log?.error(`Protocol error ${error}`,
                    {
                        messageMetaData: {
                            documentId: this.documentId,
                            tenantId: this.tenantId,
                        },
                    });
                throw new Error(`Protocol error ${error} for ${this.documentId} ${this.tenantId}`);
            }
        }
    }

    private revertProtocolState(protocolState: IProtocolState, pendingOps: ISequencedDocumentMessage[]) {
        this.protocolHandler = initializeProtocol(protocolState, this.term);
        this.pendingMessages = new Deque(pendingOps);
    }

    private generateCheckpoint(logOffset: number): IScribe {
        const protocolState = this.protocolHandler.getProtocolState();
        const checkpoint: IScribe = {
            lastClientSummaryHead: this.lastClientSummaryHead,
            logOffset,
            minimumSequenceNumber: this.minSequenceNumber,
            protocolState,
            sequenceNumber: this.sequenceNumber,
        };
        return checkpoint;
    }

    private checkpointCore(checkpoint: IScribe, queuedMessage: IQueuedMessage, clearCache: boolean) {
        if (this.closed) {
            return;
        }

        if (this.pendingP) {
            this.pendingCheckpointScribe = checkpoint;
            this.pendingCheckpointOffset = queuedMessage;
            return;
        }

        this.pendingP = clearCache ?
            this.checkpointManager.delete(this.protocolHead, true) :
            this.writeCheckpoint(checkpoint);
        this.pendingP.then(
            () => {
                this.pendingP = undefined;
                this.context.checkpoint(queuedMessage);

                const pendingScribe = this.pendingCheckpointScribe;
                const pendingOffset = this.pendingCheckpointOffset;
                if (pendingScribe && pendingOffset) {
                    this.pendingCheckpointScribe = undefined;
                    this.pendingCheckpointOffset = undefined;
                    this.checkpointCore(pendingScribe, pendingOffset, clearCache);
                }
            },
            (error) => {
                this.context.error(error, {
                    restart: true,
                    tenantId: this.tenantId,
                    documentId: this.documentId,
                });
            });
    }

    private async writeCheckpoint(checkpoint: IScribe) {
        const inserts = this.pendingCheckpointMessages.toArray();
        await this.checkpointManager.write(checkpoint, this.protocolHead, inserts);
        if (inserts.length > 0) {
            // Since we are storing logTails with every summary, we need to make sure that messages are either in DB
            // or in memory. In other words, we can only remove messages from memory once there is a copy in the DB
            const lastInsertedSeqNumber = inserts[inserts.length - 1].operation.sequenceNumber;
            while (this.pendingCheckpointMessages.length > 0 &&
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                this.pendingCheckpointMessages.peekFront()!.operation.sequenceNumber <= lastInsertedSeqNumber) {
                this.pendingCheckpointMessages.removeFront();
            }
        }
    }

    /**
     * Protocol head is the sequence number of the last summary
     * This method updates the protocol head to the new summary sequence number
     * @param protocolHead The sequence number of the new summary
     */
    private async updateProtocolHead(protocolHead: number) {
        if (this.serviceConfiguration.scribe.nackMessages.enable) {
            const opsSincePreviousSummary = this.sequenceNumber - this.protocolHead;
            if (opsSincePreviousSummary >= this.serviceConfiguration.scribe.nackMessages.maxOps) {
                // we were over the limit, so we must have been nacking messages

                // verify this new summary will get out us of this state
                const opsSinceNewSummary = this.sequenceNumber - protocolHead;
                if (opsSinceNewSummary < this.serviceConfiguration.scribe.nackMessages.maxOps) {
                    // tell deli to stop nacking future messages
                    await this.sendNackMessage(undefined);
                }
            }
        }

        this.protocolHead = protocolHead;
    }

    private async sendSummaryAck(contents: ISummaryAck) {
        const operation: IDocumentMessage = {
            clientSequenceNumber: -1,
            contents,
            referenceSequenceNumber: -1,
            traces: this.serviceConfiguration.enableTraces ? [] : undefined,
            type: MessageType.SummaryAck,
        };

        return this.sendToDeli(operation);
    }

    private async sendSummaryNack(contents: ISummaryNack) {
        const operation: IDocumentMessage = {
            clientSequenceNumber: -1,
            contents,
            referenceSequenceNumber: -1,
            traces: this.serviceConfiguration.enableTraces ? [] : undefined,
            type: MessageType.SummaryNack,
        };

        return this.sendToDeli(operation);
    }

    // Sends a confirmation back to deli as a signal to update its DSN. Note that 'durableSequenceNumber (dsn)'
    // runs ahead of last summary sequence number (protocolHead). The purpose of dsn is to inform deli about permanent
    // storage so that it can hydrate its state after a failure. The client's are still reponsible for fetching ops
    // from protocolHead to dsn.
    private async sendSummaryConfirmationMessage(durableSequenceNumber: number, clearCache: boolean) {
        const controlMessage: IControlMessage = {
            type: ControlMessageType.UpdateDSN,
            contents: {
                durableSequenceNumber,
                clearCache,
            },
        };

        const operation: IDocumentSystemMessage = {
            clientSequenceNumber: -1,
            contents: null,
            data: JSON.stringify(controlMessage),
            referenceSequenceNumber: -1,
            traces: this.serviceConfiguration.enableTraces ? [] : undefined,
            type: MessageType.Control,
        };

        return this.sendToDeli(operation);
    }

    private async sendNackMessage(contents: INackMessagesControlMessageContents | undefined) {
        const controlMessage: IControlMessage = {
            type: ControlMessageType.NackMessages,
            contents,
        };

        const operation: IDocumentSystemMessage = {
            clientSequenceNumber: -1,
            contents: null,
            data: JSON.stringify(controlMessage),
            referenceSequenceNumber: -1,
            traces: this.serviceConfiguration.enableTraces ? [] : undefined,
            type: MessageType.Control,
        };

        return this.sendToDeli(operation);
    }

    // eslint-disable-next-line @typescript-eslint/promise-function-async
    private sendToDeli(operation: IDocumentMessage | IDocumentSystemMessage): Promise<any> {
        const message: IRawOperationMessage = {
            clientId: null,
            documentId: this.documentId,
            operation,
            tenantId: this.tenantId,
            timestamp: Date.now(),
            type: RawOperationType,
        };

        if (!this.producer) {
            throw new Error("Invalid producer");
        }

        return this.producer.send(
            [message],
            this.tenantId,
            this.documentId);
    }

    private setStateFromCheckpoint(scribe: IScribe) {
        this.sequenceNumber = scribe.sequenceNumber;
        this.minSequenceNumber = scribe.minimumSequenceNumber;
        this.lastClientSummaryHead = scribe.lastClientSummaryHead;
    }
}
