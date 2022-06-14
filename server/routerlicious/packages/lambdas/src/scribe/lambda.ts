/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { inspect } from "util";
import { ProtocolOpHandler } from "@fluidframework/protocol-base";
import {
    IDocumentSystemMessage,
    ISequencedDocumentMessage,
    ISummaryAck,
    ISummaryNack,
    MessageType,
    ISequencedDocumentAugmentedMessage,
    ISequencedDocumentSystemMessage,
    IProtocolState,
} from "@fluidframework/protocol-definitions";
import { DocumentContext } from "@fluidframework/server-lambdas-driver";
import {
    ControlMessageType,
    extractBoxcar,
    IContext,
    IControlMessage,
    IProducer,
    IScribe,
    ISequencedOperationMessage,
    IServiceConfiguration,
    SequencedOperationType,
    IQueuedMessage,
    IPartitionLambda,
    LambdaCloseType,
} from "@fluidframework/server-services-core";
import {
    getLumberBaseProperties,
    Lumber,
    LumberEventName,
    Lumberjack,
} from "@fluidframework/server-services-telemetry";
import Deque from "double-ended-queue";
import * as _ from "lodash";
import { createSessionMetric, logCommonSessionEndMetrics } from "../utils";
import { ICheckpointManager, IPendingMessageReader, ISummaryReader, ISummaryWriter } from "./interfaces";
import { initializeProtocol, sendToDeli } from "./utils";

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

    // Seqeunce number of the last summarised op
    private lastSummarySequenceNumber: number | undefined;

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
        private scribeSessionMetric: Lumber<LumberEventName.ScribeSessionResult> | undefined,
    ) {
        this.lastOffset = scribe.logOffset;
        this.setStateFromCheckpoint(scribe);
        this.pendingMessages = new Deque<ISequencedDocumentMessage>(messages);
    }

    public async handler(message: IQueuedMessage) {
        // Skip any log messages we have already processed. Can occur in the case Kafka needed to restart but
        // we had already checkpointed at a given offset.
        if (message.offset <= this.lastOffset) {
            this.context.checkpoint(message);
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
                            throw Error(errorMsg);
                        }
                        this.term = lastSummary.term;
                        const lastScribe = JSON.parse(lastSummary.scribe) as IScribe;
                        this.updateProtocolHead(lastSummary.protocolHead);
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
                                    await this.sendSummaryConfirmationMessage(operation.sequenceNumber, true, false);
                                    this.updateProtocolHead(this.protocolHandler.sequenceNumber);
                                    this.updateLastSummarySequenceNumber(this.protocolHandler.sequenceNumber);
                                    const summaryResult = `Client summary success @${value.operation.sequenceNumber}`;
                                    this.context.log?.info(
                                        summaryResult,
                                        {
                                            messageMetaData: {
                                                documentId: this.documentId,
                                                tenantId: this.tenantId,
                                            },
                                        },
                                    );
                                    Lumberjack.info(summaryResult,
                                        getLumberBaseProperties(this.documentId, this.tenantId));
                                } else {
                                    const nackMessage = summaryResponse.message as ISummaryNack;
                                    await this.sendSummaryNack(nackMessage);
                                    const errorMsg = `Client summary failure @${value.operation.sequenceNumber}. `
                                        + `Error: ${nackMessage.message}`;
                                    this.context.log?.error(
                                        errorMsg,
                                        {
                                            messageMetaData: {
                                                documentId: this.documentId,
                                                tenantId: this.tenantId,
                                            },
                                        },
                                    );
                                    Lumberjack.error(errorMsg, getLumberBaseProperties(this.documentId, this.tenantId));
                                    this.revertProtocolState(prevState.protocolState, prevState.pendingOps);
                                }
                            }
                        } catch (ex) {
                            const errorMsg = `Client summary failure @${value.operation.sequenceNumber}`;
                            this.context.log?.error(`${errorMsg} Exception: ${inspect(ex)}`);
                            Lumberjack.error(errorMsg, getLumberBaseProperties(this.documentId, this.tenantId), ex);
                            this.revertProtocolState(prevState.protocolState, prevState.pendingOps);
                            // If this flag is set, we should ignore any storage specific error and move forward
                            // to process the next message.
                            if (this.serviceConfiguration.scribe.ignoreStorageException) {
                                await this.sendSummaryNack(
                                    {
                                        message: "Failed to summarize the document.",
                                        summaryProposal: {
                                            summarySequenceNumber: value.operation.sequenceNumber,
                                        },
                                    },
                                );
                            } else {
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
                                    false,
                                    this.serviceConfiguration.scribe.clearCacheAfterServiceSummary);
                                this.updateLastSummarySequenceNumber(operation.sequenceNumber);
                                const summaryResult = `Service summary success @${operation.sequenceNumber}`;
                                this.context.log?.info(
                                    summaryResult,
                                    {
                                        messageMetaData: {
                                            documentId: this.documentId,
                                            tenantId: this.tenantId,
                                        },
                                    },
                                );
                                Lumberjack.info(summaryResult, getLumberBaseProperties(this.documentId, this.tenantId));
                            }
                        } catch (ex) {
                            const errorMsg = `Service summary failure @${operation.sequenceNumber}`;

                            // If this flag is set, we should ignore any storage speciic error and move forward
                            // to process the next message.
                            if (this.serviceConfiguration.scribe.ignoreStorageException) {
                                this.context.log?.error(
                                    errorMsg,
                                    {
                                        messageMetaData: {
                                            documentId: this.documentId,
                                            tenantId: this.tenantId,
                                        },
                                    });
                                Lumberjack.error(errorMsg, getLumberBaseProperties(this.documentId, this.tenantId), ex);
                            } else {
                                throw ex;
                            }
                        }
                    }
                } else if (value.operation.type === MessageType.SummaryAck) {
                    const operation = value.operation as ISequencedDocumentSystemMessage;
                    const content: ISummaryAck = operation.data ? JSON.parse(operation.data) : operation.contents;
                    this.lastClientSummaryHead = content.handle;
                    // An external summary writer can only update the protocolHead when the ack is sequenced
                    // back to the stream.
                    if (this.summaryWriter.isExternal) {
                        this.updateProtocolHead(content.summaryProposal.summarySequenceNumber);
                        this.updateLastSummarySequenceNumber(content.summaryProposal.summarySequenceNumber);
                    }
                }
            }
        }

        const checkpoint = this.generateCheckpoint(message.offset);
        this.checkpointCore(
            checkpoint,
            message,
            this.clearCache);
        this.lastOffset = message.offset;
    }

    public close(closeType: LambdaCloseType) {
        this.logScribeSessionMetrics(closeType);

        this.closed = true;
        this.protocolHandler.close();
    }

    private logScribeSessionMetrics(closeType: LambdaCloseType) {
        if (this.scribeSessionMetric?.isCompleted()) {
            this.scribeSessionMetric = createSessionMetric(this.tenantId,
                this.documentId,
                LumberEventName.ScribeSessionResult,
                this.serviceConfiguration,
            );
        }

        logCommonSessionEndMetrics(
            this.context as DocumentContext,
            closeType,
            this.scribeSessionMetric,
            this.sequenceNumber,
            this.protocolHead,
            undefined,
        );
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
                Lumberjack.error(`Protocol error`, getLumberBaseProperties(this.documentId, this.tenantId), error);
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
            lastSummarySequenceNumber: this.lastSummarySequenceNumber,
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
     * @param protocolHead - The sequence number of the new summary
     */
    private updateProtocolHead(protocolHead: number) {
        this.protocolHead = protocolHead;
    }

    /**
     * lastSummarySequenceNumber tracks the sequence number that was part of the latest summary
     * This method updates it to the sequence number that was part of the latest summary
     * @param summarySequenceNumber - The sequence number of the operation that was part of the latest summary
     */
    private updateLastSummarySequenceNumber(summarySequenceNumber: number) {
        this.lastSummarySequenceNumber = summarySequenceNumber;
    }

    private async sendSummaryAck(contents: ISummaryAck) {
        const operation: IDocumentSystemMessage = {
            clientSequenceNumber: -1,
            contents,
            data: JSON.stringify(contents),
            referenceSequenceNumber: -1,
            traces: this.serviceConfiguration.enableTraces ? [] : undefined,
            type: MessageType.SummaryAck,
        };

        return sendToDeli(this.tenantId, this.documentId, this.producer, operation);
    }

    private async sendSummaryNack(contents: ISummaryNack) {
        const operation: IDocumentSystemMessage = {
            clientSequenceNumber: -1,
            contents,
            data: JSON.stringify(contents),
            referenceSequenceNumber: -1,
            traces: this.serviceConfiguration.enableTraces ? [] : undefined,
            type: MessageType.SummaryNack,
        };

        return sendToDeli(this.tenantId, this.documentId, this.producer, operation);
    }

    // Sends a confirmation back to deli as a signal to update its DSN. Note that 'durableSequenceNumber (dsn)'
    // runs ahead of last summary sequence number (protocolHead). The purpose of dsn is to inform deli about permanent
    // storage so that it can hydrate its state after a failure. The client's are still reponsible for fetching ops
    // from protocolHead to dsn.
    private async sendSummaryConfirmationMessage(durableSequenceNumber: number,
        isClientSummary: boolean, clearCache: boolean) {
        const controlMessage: IControlMessage = {
            type: ControlMessageType.UpdateDSN,
            contents: {
                durableSequenceNumber,
                isClientSummary,
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

        return sendToDeli(this.tenantId, this.documentId, this.producer, operation);
    }

    private setStateFromCheckpoint(scribe: IScribe) {
        this.sequenceNumber = scribe.sequenceNumber;
        this.minSequenceNumber = scribe.minimumSequenceNumber;
        this.lastClientSummaryHead = scribe.lastClientSummaryHead;
        this.lastSummarySequenceNumber = scribe.lastSummarySequenceNumber;
    }
}
