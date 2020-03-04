/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable no-null/no-null */

import { ICreateCommitParams } from "@microsoft/fluid-gitresources";
import {
    IQuorumSnapshot,
    ProtocolOpHandler,
    getQuorumTreeEntries,
    mergeAppAndProtocolTree,
} from "@microsoft/fluid-protocol-base";
import {
    IDocumentMessage,
    ISequencedDocumentMessage,
    ISummaryAck,
    ISummaryContent,
    ISummaryNack,
    ITreeEntry,
    MessageType,
} from "@microsoft/fluid-protocol-definitions";
import { IGitManager } from "@microsoft/fluid-server-services-client";
import {
    extractBoxcar,
    ICollection,
    IContext,
    IDocument,
    IProducer,
    IRawOperationMessage,
    IScribe,
    ISequencedOperationMessage,
    RawOperationType,
    SequencedOperationType,
    IQueuedMessage,
} from "@microsoft/fluid-server-services-core";
import * as Deque from "double-ended-queue";
import * as _ from "lodash";
import { SequencedLambda } from "../sequencedLambda";

export class ScribeLambda extends SequencedLambda {
    // Value of the last processed Kafka offset
    private readonly lastOffset: number;

    // Pending checkpoint information
    private pendingCheckpointScribe: IScribe;
    private pendingCheckpointOffset: IQueuedMessage;
    private pendingP: Promise<void>;
    private readonly pendingCheckpointMessages = new Deque<ISequencedOperationMessage>();

    // Messages not yet included within protocolHandler
    private readonly pendingMessages: Deque<ISequencedDocumentMessage>;

    // Current sequence/msn of the last processed offset
    private sequenceNumber = 0;
    private minSequenceNumber = 0;

    // Ref of the last client generated summary
    private lastClientSummaryHead: string;

    constructor(
        context: IContext,
        private readonly documentCollection: ICollection<IDocument>,
        private readonly messageCollection: ICollection<ISequencedOperationMessage>,
        protected tenantId: string,
        protected documentId: string,
        scribe: IScribe,
        private readonly storage: IGitManager,
        private readonly producer: IProducer,
        private readonly protocolHandler: ProtocolOpHandler,
        private protocolHead: number,
        messages: ISequencedOperationMessage[],
        private readonly generateServiceSummary: boolean,
        private readonly nackOnSummarizeException?: boolean,
    ) {
        super(context);

        this.lastOffset = scribe.logOffset;
        this.sequenceNumber = scribe.sequenceNumber;
        this.minSequenceNumber = scribe.minimumSequenceNumber;
        this.lastClientSummaryHead = scribe.lastClientSummaryHead;

        // Filter and keep messages up to protocol state.
        this.pendingMessages = new Deque<ISequencedDocumentMessage>(
            messages
                .filter((message) => message.operation.sequenceNumber > scribe.protocolState.sequenceNumber)
                .map((message) => message.operation));
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
                    const content = JSON.parse(value.operation.contents) as ISummaryContent;
                    const summarySequenceNumber = value.operation.sequenceNumber;

                    // Process up to the summary op value to get the protocol state at the summary op.
                    // TODO: We should vaidate that we can actually make a summary prior to this call.
                    this.processFromPending(value.operation.referenceSequenceNumber);

                    try {
                        await this.summarize(
                            content,
                            this.protocolHandler.minimumSequenceNumber,
                            this.protocolHandler.sequenceNumber,
                            this.protocolHandler.quorum.snapshot(),
                            summarySequenceNumber);
                        this.protocolHead = summarySequenceNumber;
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
                    if (this.generateServiceSummary) {
                        const summarySequenceNumber = value.operation.sequenceNumber;
                        await this.createServiceSummary(summarySequenceNumber);
                        this.protocolHead = summarySequenceNumber;
                    }
                } else if (value.operation.type === MessageType.SummaryAck) {
                    const content = value.operation.contents as ISummaryAck;
                    this.lastClientSummaryHead = content.handle;
                }
            }
        }

        this.checkpoint(message);
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

    private checkpoint(queuedMessage: IQueuedMessage) {
        const protocolState = this.protocolHandler.getProtocolState();

        const checkpoint: IScribe = {
            lastClientSummaryHead: this.lastClientSummaryHead,
            logOffset: queuedMessage.offset,
            minimumSequenceNumber: this.minSequenceNumber,
            protocolState,
            sequenceNumber: this.sequenceNumber,
        };

        this.checkpointCore(checkpoint, queuedMessage);
    }

    private checkpointCore(checkpoint: IScribe, queuedMessage: IQueuedMessage) {
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        if (this.pendingP) {
            this.pendingCheckpointScribe = checkpoint;
            this.pendingCheckpointOffset = queuedMessage;
            return;
        }

        this.pendingP = this.writeCheckpoint(checkpoint);
        this.pendingP.then(
            () => {
                this.pendingP = undefined;
                this.context.checkpoint(queuedMessage);

                if (this.pendingCheckpointScribe) {
                    const pendingScribe = this.pendingCheckpointScribe;
                    const pendingOffset = this.pendingCheckpointOffset;
                    this.pendingCheckpointScribe = undefined;
                    this.pendingCheckpointOffset = undefined;
                    this.checkpointCore(pendingScribe, pendingOffset);
                }
            },
            (error) => {
                this.context.error(error, true);
            });
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
        this.pendingCheckpointMessages.clear();

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
        const removeSequenceNumber = Math.min(checkpoint.protocolState.sequenceNumber, this.protocolHead);
        await this.messageCollection
            .deleteMany({
                "documentId": this.documentId,
                "operation.sequenceNumber": { $lte: removeSequenceNumber },
                "tenantId": this.tenantId,
            });
    }

    /**
     * Helper function that performs the final summary. After first doing some basic validation against the
     * parameters of the summary then goes and writes it by appending the protocol data to the tree specified
     * by the summary.
     */
    private async summarize(
        content: ISummaryContent,
        minimumSequenceNumber: number,
        sequenceNumber: number,
        quorumSnapshot: IQuorumSnapshot,
        summarySequenceNumber: number,
    ): Promise<void> {
        // If the sequence number for the protocol head is greater than current sequence number then we
        // have already captured this summary and are processing this message due to a replay of the stream.
        // As such we can skip it.
        if (this.protocolHead >= sequenceNumber) {
            return;
        }

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
        const entries: ITreeEntry[] =
            getQuorumTreeEntries(this.documentId, minimumSequenceNumber, sequenceNumber, quorumSnapshot);

        const [protocolTree, appSummaryTree] = await Promise.all([
            this.storage.createTree({ entries, id: null }),
            this.storage.getTree(content.handle, false),
        ]);

        // Combine the app summary with .protocol
        const newTreeEntries = mergeAppAndProtocolTree(appSummaryTree, protocolTree);

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
    }

    private async createServiceSummary(sequenceNumber: number): Promise<void> {
        if (this.protocolHead >= sequenceNumber) {
            return;
        }

        const existingRef = await this.storage.getRef(encodeURIComponent(this.documentId));

        // Client assumes at least one app generated summary. To keep compatibility for now, service summary requires
        // at least one prior client generated summary.
        if (!existingRef) {
            return;
        }

        // Fetch the logtail starting from the last protocol state
        const query = {
            "documentId": this.documentId,
            "tenantId": this.tenantId,
            "operation.sequenceNumber": {
                $gt: this.protocolHead,
                $lt: sequenceNumber + 1,
            },
        };
        const logTail = this.messageCollection.find(query, { "operation.sequenceNumber": 1 });
        const entries: ITreeEntry[] = [
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

        // Fetch the last commit and summary tree. Create a new tree with logTail.
        const lastCommit = await this.storage.getCommit(existingRef.object.sha);
        const [logTailTree, lastSummaryTree] = await Promise.all([
            this.storage.createTree({ entries, id: null }),
            this.storage.getTree(lastCommit.tree.sha, false),
        ]);

        // Combine the last summary tree with .logTail tree
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

        const gitTree = await this.storage.createGitTree({ tree: newTreeEntries });
        const commitParams: ICreateCommitParams = {
            author: {
                date: new Date().toISOString(),
                email: "praguertdev@microsoft.com",
                name: "Routerlicious Service",
            },
            message: "Service_Summary",
            parents: lastCommit.parents.map((parent) => parent.sha),
            tree: gitTree.sha,
        };

        // Finally commit the service summary and update the ref.
        const commit = await this.storage.createCommit(commitParams);
        await this.storage.upsertRef(this.documentId, commit.sha);
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

        await this.sendToDeli(operation);
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

        await this.sendToDeli(operation);
    }

    // eslint-disable-next-line @typescript-eslint/promise-function-async
    private sendToDeli(operation: IDocumentMessage): Promise<any> {
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
}
