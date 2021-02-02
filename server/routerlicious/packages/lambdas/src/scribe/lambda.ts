/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable no-null/no-null */

import assert from "assert";
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
} from "@fluidframework/server-services-core";
import Deque from "double-ended-queue";
import * as _ from "lodash";
import { SequencedLambda } from "../sequencedLambda";
import { ICheckpointManager, ISummaryReader, ISummaryWriter } from "./interfaces";
import { initializeProtocol } from "./utils";

export class ScribeLambda extends SequencedLambda {
    // Value of the last processed Kafka offset
    private lastOffset: number;

    // Pending checkpoint information
    private pendingCheckpointScribe: IScribe;
    private pendingCheckpointOffset: IQueuedMessage;
    private pendingP: Promise<void>;
    private readonly pendingCheckpointMessages = new Deque<ISequencedOperationMessage>();

    // Messages not yet processed by protocolHandler
    private pendingMessages: Deque<ISequencedDocumentMessage>;

    // Current sequence/msn of the last processed offset
    private sequenceNumber = 0;
    private minSequenceNumber = 0;

    // Ref of the last client generated summary
    private lastClientSummaryHead: string;

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
        private readonly checkpointManager: ICheckpointManager,
        scribe: IScribe,
        private readonly serviceConfiguration: IServiceConfiguration,
        private readonly producer: IProducer | undefined,
        private protocolHandler: ProtocolOpHandler,
        private term: number,
        private protocolHead: number,
        messages: ISequencedDocumentMessage[],
    ) {
        super(context);

        this.lastOffset = scribe.logOffset;
        this.setStateFromCheckpoint(scribe);
        // Filter and keep messages after protocol state
        this.pendingMessages = new Deque<ISequencedDocumentMessage>(
            messages.filter((message) => message.sequenceNumber > scribe.protocolState.sequenceNumber));
    }

    public async handlerCore(message: IQueuedMessage): Promise<void> {
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
                            throw Error(`Required summary can't be fetched`);
                        }
                        this.term = lastSummary.term;
                        const lastScribe = JSON.parse(lastSummary.scribe) as IScribe;
                        this.protocolHead = lastSummary.protocolHead;
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

                // Handles a partial checkpoint case where messages were inserted into DB but checkpointing failed.
                if (this.pendingMessages.length > 0 &&
                    value.operation.sequenceNumber <= this.pendingMessages.peekBack().sequenceNumber) {
                    continue;
                }

                // Add the message to the list of pending for this document and those that we need
                // to include in the checkpoint
                this.pendingMessages.push(value.operation);
                this.pendingCheckpointMessages.push(value);

                // Update the current sequence and min sequence numbers
                const msnChanged = this.minSequenceNumber !== value.operation.minimumSequenceNumber;
                this.sequenceNumber = value.operation.sequenceNumber;
                this.minSequenceNumber = value.operation.minimumSequenceNumber;

                if (msnChanged) {
                    // When the MSN changes we can process up to it to save space
                    this.processFromPending(this.minSequenceNumber);
                }

                const messageMetaData = {
                    documentId: this.documentId,
                    tenantId: this.tenantId,
                };

                this.clearCache = false;
                if (value.operation.type === MessageType.Summarize) {
                    // Process up to the summary op ref seq to get the protocol state at the summary op.
                    // Capture state first in case the summary is nacked.
                    const prevState = {
                        protocolState: this.protocolHandler.getProtocolState(),
                        pendingOps: this.pendingMessages.toArray(),
                    };
                    this.processFromPending(value.operation.referenceSequenceNumber);

                    // Only process the op if the protocol state advances. This elimiates the corner case where we have
                    // already captured this summary and are processing this message due to a replay of the stream.
                    if (this.protocolHead < this.protocolHandler.sequenceNumber) {
                        try {
                            const scribeCheckpoint = this.generateCheckpoint(this.lastOffset);
                            const operation = value.operation as ISequencedDocumentAugmentedMessage;
                            const summaryResponse = await this.summaryWriter.writeClientSummary(
                                operation,
                                this.lastClientSummaryHead,
                                this.protocolHandler.minimumSequenceNumber,
                                this.protocolHandler.sequenceNumber,
                                this.protocolHandler.quorum.snapshot(),
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
                                    this.protocolHead = this.protocolHandler.sequenceNumber;
                                    this.context.log.info(
                                        `Client summary success @${value.operation.sequenceNumber}`,
                                        { messageMetaData },
                                    );
                                } else {
                                    await this.sendSummaryNack(summaryResponse.message as ISummaryNack);
                                    this.context.log.error(
                                        `Client summary failure @${value.operation.sequenceNumber}`,
                                        { messageMetaData },
                                    );
                                    this.revertProtocolState(prevState.protocolState, prevState.pendingOps);
                                }
                            }
                        } catch (ex) {
                            this.revertProtocolState(prevState.protocolState, prevState.pendingOps);
                            // If this flag is set, we should ignore any storage speciic error and move forward
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
                                this.context.log.info(
                                    `Service summary success @${operation.sequenceNumber}`, { messageMetaData });
                            }
                        } catch (ex) {
                            // If this flag is set, we should ignore any storage speciic error and move forward
                            // to process the next message.
                            if (this.serviceConfiguration.scribe.ignoreStorageException) {
                                this.context.log.error(
                                    `Service summary failure @${operation.sequenceNumber}`, { messageMetaData });
                            } else {
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
                        this.protocolHead = content.summaryProposal.summarySequenceNumber;
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

    public close() {
        this.closed = true;
        this.protocolHandler.close();
    }

    // Advances the protocol state up to 'target' sequence number. Having an exception while running this code
    // is crucial and the document is essentially corrupted at this point. We should start logging this and
    // have a better understanding of all failure modes.
    private processFromPending(target: number) {
        while (this.pendingMessages.length > 0 && this.pendingMessages.peekFront().sequenceNumber <= target) {
            const message = this.pendingMessages.shift();
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
                this.context.log.error(`Protocol error ${error}`,
                    {
                        documentId: this.documentId,
                        tenantId: this.tenantId,
                    });
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

        // eslint-disable-next-line @typescript-eslint/no-misused-promises
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

                if (this.pendingCheckpointScribe) {
                    const pendingScribe = this.pendingCheckpointScribe;
                    const pendingOffset = this.pendingCheckpointOffset;
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
                this.pendingCheckpointMessages.peekFront().operation.sequenceNumber <= lastInsertedSeqNumber) {
                this.pendingCheckpointMessages.removeFront();
            }
        }
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
