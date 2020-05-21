/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable no-null/no-null */

import * as assert from "assert";
import { ICreateCommitParams, ICreateTreeEntry } from "@microsoft/fluid-gitresources";
import {
    generateServiceProtocolEntries,
    IQuorumSnapshot,
    ProtocolOpHandler,
    getQuorumTreeEntries,
    mergeAppAndProtocolTree,
} from "@fluidframework/protocol-base";
import {
    IDocumentMessage,
    IDocumentSystemMessage,
    ISequencedDocumentMessage,
    ISummaryAck,
    ISummaryContent,
    ISummaryNack,
    ITreeEntry,
    MessageType,
    TreeEntry,
    FileMode,
    ISequencedDocumentAugmentedMessage,
} from "@fluidframework/protocol-definitions";
import { IGitManager } from "@fluidframework/server-services-client";
import {
    ControlMessageType,
    extractBoxcar,
    ICollection,
    IContext,
    IControlMessage,
    IDocument,
    IProducer,
    IRawOperationMessage,
    IScribe,
    ISequencedOperationMessage,
    RawOperationType,
    SequencedOperationType,
    IQueuedMessage,
} from "@fluidframework/server-services-core";
import * as Deque from "double-ended-queue";
import * as _ from "lodash";
import { SequencedLambda } from "../sequencedLambda";
import { fetchLatestSummaryState, initializeProtocol } from "./summaryHelper";

export class ScribeLambda extends SequencedLambda {
    // Value of the last processed Kafka offset
    private lastOffset: number;

    // Pending checkpoint information
    private pendingCheckpointScribe: IScribe;
    private pendingCheckpointOffset: IQueuedMessage;
    private pendingP: Promise<void>;
    private readonly pendingCheckpointMessages = new Deque<ISequencedOperationMessage>();

    // Messages not yet included within protocolHandler
    private pendingMessages: Deque<ISequencedDocumentMessage>;

    // Current sequence/msn of the last processed offset
    private sequenceNumber = 0;
    private minSequenceNumber = 0;

    // Ref of the last client generated summary
    private lastClientSummaryHead: string;

    // Last incoming op type.
    private lastOpType: string;

    constructor(
        protected readonly context: IContext,
        private readonly documentCollection: ICollection<IDocument>,
        private readonly messageCollection: ICollection<ISequencedOperationMessage>,
        protected tenantId: string,
        protected documentId: string,
        scribe: IScribe,
        private readonly storage: IGitManager,
        private readonly producer: IProducer,
        private protocolHandler: ProtocolOpHandler,
        private term: number,
        private protocolHead: number,
        messages: ISequencedDocumentMessage[],
        private readonly generateServiceSummary: boolean,
        private readonly nackOnSummarizeException?: boolean,
    ) {
        super(context);

        this.lastOffset = scribe.logOffset;
        this.setStateFromCheckpoint(scribe);
        // Filter and keep messages up to protocol state.
        this.pendingMessages = new Deque<ISequencedDocumentMessage>(
            messages.filter((message) => message.sequenceNumber > scribe.protocolState.sequenceNumber));
    }

    public async handlerCore(message: IQueuedMessage): Promise<void> {
        // Skip any log messages we have already processed. Can occur in the case Kafka needed to restart but
        // we had already checkpointed at a given offset.
        if (message.offset <= this.lastOffset) {
            return;
        }

        const boxcar = extractBoxcar(message);

        for (const baseMessage of boxcar.contents) {
            if (baseMessage.type === SequencedOperationType) {
                const value = baseMessage as ISequencedOperationMessage;

                // back-compat check
                if (this.term && value.operation.term) {
                    if (value.operation.term < this.term) {
                        continue;
                    } else if (value.operation.term > this.term) {
                        const lastSummary = await fetchLatestSummaryState(this.storage, this.documentId);
                        if (!lastSummary.fromSummary) {
                            throw Error(`Required summary can't be fetched`);
                        }
                        this.term = lastSummary.term;
                        const lastScribe = JSON.parse(lastSummary.scribe) as IScribe;
                        this.protocolHead = lastSummary.protocolHead;
                        this.protocolHandler = initializeProtocol(this.documentId, lastScribe, this.term);
                        this.setStateFromCheckpoint(lastScribe);
                        this.pendingMessages = new Deque<ISequencedDocumentMessage>(
                            lastSummary.messages.filter(
                                (op) => op.sequenceNumber > lastScribe.protocolState.sequenceNumber));

                        this.pendingP = undefined;
                        this.pendingCheckpointScribe = undefined;
                        this.pendingCheckpointOffset = undefined;

                        await this.deleteCheckpoint(lastScribe.sequenceNumber + 1, false);
                    }
                }

                if (value.operation.sequenceNumber <= this.sequenceNumber) {
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

                if (value.operation.type === MessageType.Summarize) {
                    const summarySequenceNumber = value.operation.sequenceNumber;

                    // Process up to the summary op value to get the protocol state at the summary op.
                    // TODO: We should vaidate that we can actually make a summary prior to this call.
                    this.processFromPending(value.operation.referenceSequenceNumber);

                    try {
                        const scribeCheckpoint = this.generateCheckpoint(this.lastOffset);
                        await this.summarize(
                            value.operation as ISequencedDocumentAugmentedMessage,
                            this.protocolHandler.minimumSequenceNumber,
                            this.protocolHandler.sequenceNumber,
                            this.protocolHandler.quorum.snapshot(),
                            summarySequenceNumber,
                            value.operation.term ?? 1,
                            scribeCheckpoint);
                        this.protocolHead = this.protocolHandler.sequenceNumber;
                        this.context.log.info(
                            `Client summary @seq${summarySequenceNumber} for ${this.tenantId}/${this.documentId}`);
                    } catch (ex) {
                        if (this.nackOnSummarizeException) {
                            // SPO wants to nack when summarize fails
                            // In SPOs implementation of gitManager, we have built in retry logic for retryable errors.
                            // So when it does throw, we should really nack the summary.
                            await this.sendSummaryNack(
                                summarySequenceNumber,
                                `Failed to summarize the document.`,
                            );
                        } else {
                            throw ex;
                        }
                    }
                } else if (value.operation.type === MessageType.NoClient) {
                    assert(
                        value.operation.referenceSequenceNumber === value.operation.sequenceNumber,
                        `${value.operation.referenceSequenceNumber} != ${value.operation.sequenceNumber}`);
                    assert(
                        value.operation.minimumSequenceNumber === value.operation.sequenceNumber,
                        `${value.operation.minimumSequenceNumber} != ${value.operation.sequenceNumber}`);
                    if (this.generateServiceSummary) {
                        const summarySequenceNumber = value.operation.sequenceNumber;
                        const deliContent = (value.operation as ISequencedDocumentAugmentedMessage).additionalContent;
                        const scribeCheckpoint = this.generateCheckpoint(this.lastOffset);
                        await this.createServiceSummary(summarySequenceNumber, deliContent, scribeCheckpoint);
                        this.context.log.info(
                            `Service summary @seq${summarySequenceNumber} for ${this.tenantId}/${this.documentId}`);
                    }
                } else if (value.operation.type === MessageType.SummaryAck) {
                    const content = value.operation.contents as ISummaryAck;
                    this.lastClientSummaryHead = content.handle;
                }
                this.lastOpType = value.operation.type;
            }
        }

        const checkpoint = this.generateCheckpoint(message.offset);
        this.checkpointCore(
            checkpoint,
            message,
            this.generateServiceSummary && this.lastOpType === MessageType.NoClient);
        this.lastOffset = message.offset;
    }

    public close() {
        this.protocolHandler.close();
    }

    private processFromPending(target: number) {
        while (this.pendingMessages.length > 0 && this.pendingMessages.peekFront().sequenceNumber <= target) {
            const message = this.pendingMessages.shift();
            if (message.contents && typeof message.contents === "string" && message.type !== MessageType.ClientLeave) {
                const clonedMessage = _.cloneDeep(message);
                clonedMessage.contents = JSON.parse(clonedMessage.contents);
                this.protocolHandler.processMessage(clonedMessage, false);
            } else {
                this.protocolHandler.processMessage(message, false);
            }
        }
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
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        if (this.pendingP) {
            this.pendingCheckpointScribe = checkpoint;
            this.pendingCheckpointOffset = queuedMessage;
            return;
        }

        this.pendingP = clearCache ?
            this.deleteCheckpoint(this.protocolHead, true) :
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
                this.context.error(error, true);
            });
    }

    /**
     * Removes the checkpoint information from MongoDB
     */
    private async deleteCheckpoint(sequenceNumber: number, lte: boolean) {
        // Clears the checkpoint information from mongodb.
        await this.documentCollection.update(
            {
                documentId: this.documentId,
                tenantId: this.tenantId,
            },
            {
                scribe: "",
            },
            null);

        // And then delete messagse we no longer will reference
        await this.messageCollection
            .deleteMany({
                "documentId": this.documentId,
                "operation.sequenceNumber": lte ? { $lte: sequenceNumber } : { $gte: sequenceNumber },
                "tenantId": this.tenantId,
            });
        this.context.log.info(`Scribe cache is cleared for ${this.tenantId}/${this.documentId}`);
    }

    /**
     * Writes the checkpoint information to MongoDB
     */
    private async writeCheckpoint(checkpoint: IScribe) {
        // The order of the three operations below is important.
        // We start by writing out all pending messages to the database. This may be more messages that we would
        // have seen at the current checkpoint we are trying to write (because we continue process messages while
        // waiting to write a checkpoint) but is more efficient and simplifies the code path.
        //
        // We then write the update to the document collection. This marks a log offset inside of MongoDB at which
        // point if Kafka restartes we will not do work prior to this logOffset. At this point the snapshot
        // history has been written, all ops needed are written, and so we can store the final mark.
        //
        // And last we delete all mesages in the list prior to the protocol sequence number. From now on these
        // will no longer be referenced.

        const inserts = this.pendingCheckpointMessages.toArray();
        if (inserts.length > 0) {
            await this.messageCollection
                .insertMany(inserts, false)
                // eslint-disable-next-line @typescript-eslint/promise-function-async
                .catch((error) => {
                    // Duplicate key errors are ignored since a replay may cause us to insert twice into Mongo.
                    // All other errors result in a rejected promise.
                    if (error.code !== 11000) {
                        // Needs to be a full rejection here
                        return Promise.reject(error);
                    }
                });
            // Since we are storing logTails with every summary, we need to make sure that messages are either in mongo
            // or in memory.
            const lastInsertedSeqNumber = inserts[inserts.length - 1].operation.sequenceNumber;
            while (this.pendingCheckpointMessages.length > 0 &&
                this.pendingCheckpointMessages.peekFront().operation.sequenceNumber <= lastInsertedSeqNumber) {
                this.pendingCheckpointMessages.removeFront();
            }
        }

        // Write out the full state first that we require
        await this.documentCollection.update(
            {
                documentId: this.documentId,
                tenantId: this.tenantId,
            },
            {
                // MongoDB is particular about the format of stored JSON data. For this reason we store stringified
                // given some data is user generated.
                scribe: JSON.stringify(checkpoint),
            },
            null);

        // And then delete messagse we no longer will reference
        await this.messageCollection
            .deleteMany({
                "documentId": this.documentId,
                "operation.sequenceNumber": { $lte: this.protocolHead },
                "tenantId": this.tenantId,
            });
    }

    /**
     * Helper function that performs the final summary. After first doing some basic validation against the
     * parameters of the summary then goes and writes it by appending the protocol data to the tree specified
     * by the summary.
     */
    private async summarize(
        op: ISequencedDocumentAugmentedMessage,
        minimumSequenceNumber: number,
        sequenceNumber: number,
        quorumSnapshot: IQuorumSnapshot,
        summarySequenceNumber: number,
        summaryTerm: number,
        checkpoint: IScribe,
    ): Promise<void> {
        // If the sequence number for the protocol head is greater than current sequence number then we
        // have already captured this summary and are processing this message due to a replay of the stream.
        // As such we can skip it.
        if (this.protocolHead >= sequenceNumber) {
            return;
        }

        const content = JSON.parse(op.contents) as ISummaryContent;

        // The summary must reference the existing summary to be valid. This guards against accidental sends of
        // two summaries at the same time. In this case the first one wins.
        const existingRef = await this.storage.getRef(encodeURIComponent(this.documentId));

        if (content.head) {
            // In usual case, client always refers to last summaryAck so lastClientSummaryHead should always match.
            // However, the ack itself might be lost If scribe dies right after creating the summary. In that case,
            // the client code just fetches the last summary which should be the same as existingRef sha.
            if (!existingRef ||
                (this.lastClientSummaryHead !== content.head && existingRef.object.sha !== content.head)) {
                await this.sendSummaryNack(
                    summarySequenceNumber,
                    // eslint-disable-next-line max-len
                    `Proposed parent summary "${content.head}" does not match actual parent summary "${existingRef ? existingRef.object.sha : "n/a"}".`,
                );
                return;
            }
        } else if (existingRef) {
            await this.sendSummaryNack(
                summarySequenceNumber,
                // eslint-disable-next-line max-len
                `Proposed parent summary "${content.head}" does not match actual parent summary "${existingRef.object.sha}".`,
            );
            return;
        }

        // We also validate that the parent summary is valid
        try {
            // eslint-disable-next-line @typescript-eslint/promise-function-async
            await Promise.all(content.parents.map((parentSummary) => this.storage.getCommit(parentSummary)));
        } catch (e) {
            await this.sendSummaryNack(
                summarySequenceNumber,
                "One or more parent summaries are invalid.",
            );
            return;
        }

        // At this point the summary op and its data are all valid and we can perform the write to history
        const protocolEntries: ITreeEntry[] =
            getQuorumTreeEntries(this.documentId, minimumSequenceNumber, sequenceNumber, summaryTerm, quorumSnapshot);

        // Generate a tree of logTail starting from protocol sequence number to summarySequenceNumber
        const logTailEntries = await this.generateLogtailEntries(sequenceNumber, summarySequenceNumber + 1);

        // Create service protocol entries combining scribe and deli states.
        const serviceProtocolEntries = generateServiceProtocolEntries(
            op.additionalContent,
            JSON.stringify(checkpoint));

        const [logTailTree, protocolTree, serviceProtocolTree, appSummaryTree] = await Promise.all([
            this.storage.createTree({ entries: logTailEntries, id: null }),
            this.storage.createTree({ entries: protocolEntries, id: null }),
            this.storage.createTree({ entries: serviceProtocolEntries, id: null }),
            this.storage.getTree(content.handle, false),
        ]);

        // Combine the app summary with .protocol
        const newTreeEntries = mergeAppAndProtocolTree(appSummaryTree, protocolTree);

        // Now combine with .logtail and .serviceProtocol
        newTreeEntries.push({
            mode: FileMode.Directory,
            path: ".logTail",
            sha: logTailTree.sha,
            type: "tree",
        });
        newTreeEntries.push({
            mode: FileMode.Directory,
            path: ".serviceProtocol",
            sha: serviceProtocolTree.sha,
            type: "tree",
        });

        const gitTree = await this.storage.createGitTree({ tree: newTreeEntries });
        const commitParams: ICreateCommitParams = {
            author: {
                date: new Date().toISOString(),
                email: "praguertdev@microsoft.com",
                name: "Routerlicious Service",
            },
            message: content.message,
            parents: content.parents,
            tree: gitTree.sha,
        };

        const commit = await this.storage.createCommit(commitParams);

        if (existingRef) {
            await this.storage.upsertRef(this.documentId, commit.sha);
        } else {
            await this.storage.createRef(this.documentId, commit.sha);
        }

        await this.sendSummaryAck(commit.sha, summarySequenceNumber);
        await this.sendSummaryConfirmationMessage(summarySequenceNumber, false);
    }

    private async createServiceSummary(
        sequenceNumber: number,
        serviceContent: string,
        checkpoint: IScribe): Promise<void> {
        const existingRef = await this.storage.getRef(encodeURIComponent(this.documentId));

        // Client assumes at least one app generated summary. To keep compatibility for now, service summary requires
        // at least one prior client generated summary.
        // TODO: Once clients are updated, we can remove this check.
        if (!existingRef) {
            return;
        }

        // Generate a tree of logTail starting from the last protocol state.
        const logTailEntries = await this.generateLogtailEntries(this.protocolHead, sequenceNumber + 1);

        // Create service protocol entries combining scribe and deli states.
        const serviceProtocolEntries = generateServiceProtocolEntries(
            serviceContent,
            JSON.stringify(checkpoint));

        // Fetch the last commit and summary tree. Create new trees with logTail and serviceProtocol.
        const lastCommit = await this.storage.getCommit(existingRef.object.sha);
        const [logTailTree, serviceProtocolTree, lastSummaryTree] = await Promise.all([
            this.storage.createTree({ entries: logTailEntries, id: null }),
            this.storage.createTree({ entries: serviceProtocolEntries, id: null }),
            this.storage.getTree(lastCommit.tree.sha, false),
        ]);

        // Combine the last summary tree with .logTail and .serviceProtocol
        const newTreeEntries = lastSummaryTree.tree.map((value) => {
            const createTreeEntry: ICreateTreeEntry = {
                mode: value.mode,
                path: value.path,
                sha: value.sha,
                type: value.type,
            };
            return createTreeEntry;
        });
        newTreeEntries.push({
            mode: FileMode.Directory,
            path: ".logTail",
            sha: logTailTree.sha,
            type: "tree",
        });
        newTreeEntries.push({
            mode: FileMode.Directory,
            path: ".serviceProtocol",
            sha: serviceProtocolTree.sha,
            type: "tree",
        });

        const gitTree = await this.storage.createGitTree({ tree: newTreeEntries });
        const commitParams: ICreateCommitParams = {
            author: {
                date: new Date().toISOString(),
                email: "praguertdev@microsoft.com",
                name: "Routerlicious Service",
            },
            message: `Service Summary @${sequenceNumber}`,
            parents: [lastCommit.sha],
            tree: gitTree.sha,
        };

        // Finally commit the service summary and update the ref.
        const commit = await this.storage.createCommit(commitParams);
        await this.storage.upsertRef(this.documentId, commit.sha);

        await this.sendSummaryConfirmationMessage(sequenceNumber, true);
    }

    private async getLogTail(gt: number, lt: number): Promise<ISequencedDocumentMessage[]> {
        if (lt - gt <= 1) {
            return [];
        } else {
            const query = {
                "documentId": this.documentId,
                "tenantId": this.tenantId,
                "operation.sequenceNumber": {
                    $gt: gt,
                    $lt: lt,
                },
            };
            const logTail = await this.messageCollection.find(query, { "operation.sequenceNumber": 1 });

            // If the db is not updated with all logs yet, get them from checkpoint messages.
            if (logTail.length !== (lt - gt - 1)) {
                const nextSeq = logTail.length === 0 ? gt : logTail[logTail.length - 1].operation.sequenceNumber + 1;
                const inMemoryMessages = this.pendingCheckpointMessages.toArray();
                for (const message of inMemoryMessages) {
                    if (message.operation.sequenceNumber >= nextSeq && message.operation.sequenceNumber < lt) {
                        logTail.push(message);
                    }
                }
            }
            return logTail.map((log) => log.operation);
        }
    }

    private async generateLogtailEntries(from: number, to: number): Promise<ITreeEntry[]> {
        const logTail = await this.getLogTail(from, to);
        const logTailEntries: ITreeEntry[] = [
            {
                mode: FileMode.File,
                path: "logTail",
                type: TreeEntry[TreeEntry.Blob],
                value: {
                    contents: JSON.stringify(logTail),
                    encoding: "utf-8",
                },
            },
        ];
        return logTailEntries;
    }

    private async sendSummaryAck(handle: string, summarySequenceNumber: number) {
        const contents: ISummaryAck = {
            handle,
            summaryProposal: { summarySequenceNumber },
        };

        const operation: IDocumentMessage = {
            clientSequenceNumber: -1,
            contents,
            referenceSequenceNumber: -1,
            traces: [],
            type: MessageType.SummaryAck,
        };

        return this.sendToDeli(operation);
    }

    private async sendSummaryNack(summarySequenceNumber: number, errorMessage: string) {
        const contents: ISummaryNack = {
            errorMessage,
            summaryProposal: { summarySequenceNumber },
        };

        const operation: IDocumentMessage = {
            clientSequenceNumber: -1,
            contents,
            referenceSequenceNumber: -1,
            traces: [],
            type: MessageType.SummaryNack,
        };

        return this.sendToDeli(operation);
    }

    // Note that 'durableSequenceNumber (dsn)' runs ahead of last summary sequence number (protocolHead).
    // The purpose of dsn is to inform deli about permanent storage so that it can hydrate its state after a failure.
    // The client's are still reponsible for fetching ops from protocolHead to dsn.
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
            traces: [],
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
