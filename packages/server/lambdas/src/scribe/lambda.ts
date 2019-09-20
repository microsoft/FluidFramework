/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IQuorumSnapshot, ProtocolOpHandler } from "@microsoft/fluid-container-loader";
import { ICreateCommitParams, ICreateTreeEntry } from "@microsoft/fluid-gitresources";
import {
    FileMode,
    IDocumentAttributes,
    IDocumentMessage,
    ISequencedDocumentMessage,
    ISummaryAck,
    ISummaryContent,
    ISummaryNack,
    ITreeEntry,
    MessageType,
    TreeEntry,
} from "@microsoft/fluid-protocol-definitions";
import { IGitManager } from "@microsoft/fluid-server-services-client";
import {
    extractBoxcar,
    ICollection,
    IContext,
    IDocument,
    IKafkaMessage,
    IProducer,
    IRawOperationMessage,
    IScribe,
    ISequencedOperationMessage,
    RawOperationType,
    SequencedOperationType,
} from "@microsoft/fluid-server-services-core";
import * as Deque from "double-ended-queue";
import * as _ from "lodash";
import { SequencedLambda } from "../sequencedLambda";

export class ScribeLambda extends SequencedLambda {
    // value of the last processed Kafka offset
    private lastOffset: number;

    // pending checkpoint information
    private pendingCheckpoint: IScribe;
    private pendingP: Promise<void>;
    private pendingCheckpointMessages = new Deque<ISequencedOperationMessage>();

    // messages not yet included within protocolHandler
    private pendingMessages = new Deque<ISequencedDocumentMessage>();

    // current sequence/msn of the last processed offset
    private sequenceNumber = 0;
    private minSequenceNumber = 0;

    constructor(
        context: IContext,
        private documentCollection: ICollection<IDocument>,
        private messageCollection: ICollection<ISequencedOperationMessage>,
        protected tenantId: string,
        protected documentId: string,
        scribe: IScribe,
        private storage: IGitManager,
        private producer: IProducer,
        private protocolHandler: ProtocolOpHandler,
        private protocolHead: number,
        messages: ISequencedOperationMessage[],
        private nackOnSummarizeException?: boolean,
    ) {
        super(context);

        this.lastOffset = scribe.logOffset;
        this.sequenceNumber = scribe.sequenceNumber;
        this.minSequenceNumber = scribe.minimumSequenceNumber;

        // Filter messages in case they were not deleted after the last checkpoint.
        this.pendingMessages.push(...messages
            .filter((message) => message.operation.sequenceNumber > scribe.protocolState.sequenceNumber)
            .map((message) => message.operation));
    }

    public async handlerCore(message: IKafkaMessage): Promise<void> {
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
                    // winston.info(`MSN changed to ${this.minSequenceNumber}@${this.sequenceNumber}`);
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
                }
            }
        }

        this.checkpoint(message.offset);
    }

    public close() {
        this.protocolHandler.close();
    }

    private processFromPending(target: number) {
        while (this.pendingMessages.length > 0 && this.pendingMessages.peekFront().sequenceNumber <= target) {
            const message = this.pendingMessages.shift();
            // winston.info(`Handle message ${JSON.stringify(message)}`);

            if (message.contents && typeof message.contents === "string" && message.type !== MessageType.ClientLeave) {
                const clonedMessage = _.cloneDeep(message);
                clonedMessage.contents = JSON.parse(clonedMessage.contents);
                this.protocolHandler.processMessage(clonedMessage, false);
            } else {
                this.protocolHandler.processMessage(message, false);
            }
        }
    }

    private checkpoint(logOffset: number) {
        const protocolState = this.protocolHandler.getProtocolState();

        const checkpoint: IScribe = {
            logOffset,
            minimumSequenceNumber: this.minSequenceNumber,
            protocolState,
            sequenceNumber: this.sequenceNumber,
        };

        this.checkpointCore(checkpoint);
    }

    private checkpointCore(checkpoint: IScribe) {
        if (this.pendingP) {
            this.pendingCheckpoint = checkpoint;
            return;
        }

        this.pendingP = this.writeCheckpoint(checkpoint);
        this.pendingP.then(
            () => {
                this.pendingP = undefined;
                this.context.checkpoint(checkpoint.logOffset);

                if (this.pendingCheckpoint) {
                    const pending = this.pendingCheckpoint;
                    this.pendingCheckpoint = undefined;
                    this.checkpointCore(pending);
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
        await this.messageCollection
            .deleteMany({
                "documentId": this.documentId,
                "operation.sequenceNumber": { $lte: checkpoint.protocolState.sequenceNumber },
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
        // TODO: Issue-3547 Logger abstraction in lambdas for routerlicious and Push
        // winston.info(`START Summary! ${JSON.stringify(content)}`);

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
            if (!existingRef || existingRef.object.sha !== content.head) {
                await this.sendSummaryNack(
                    summarySequenceNumber,
                    // tslint:disable-next-line:max-line-length
                    `Proposed parent summary "${content.head}" does not match actual parent summary "${existingRef ? existingRef.object.sha : "n/a"}".`,
                );
                return;
            }

        } else if (existingRef) {
            await this.sendSummaryNack(
                summarySequenceNumber,
                // tslint:disable-next-line:max-line-length
                `Proposed parent summary "${content.head}" does not match actual parent summary "${existingRef.object.sha}".`,
            );
            return;
        }

        // We also validate that the parent summary is valid
        try {
            await Promise.all(content.parents.map((parentSummary) => this.storage.getCommit(parentSummary)));
        } catch (e) {
            await this.sendSummaryNack(
                summarySequenceNumber,
                "One or more parent summaries are invalid.",
            );
            return;
        }

        // At this point the summary op and its data are all valid and we can perform the write to history
        const documentAttributes: IDocumentAttributes = {
            branch: this.documentId,
            minimumSequenceNumber,
            sequenceNumber,
        };

        const entries: ITreeEntry[] = [
            {
                mode: FileMode.File,
                path: "quorumMembers",
                type: TreeEntry[TreeEntry.Blob],
                value: {
                    contents: JSON.stringify(quorumSnapshot.members),
                    encoding: "utf-8",
                },
            },
            {
                mode: FileMode.File,
                path: "quorumProposals",
                type: TreeEntry[TreeEntry.Blob],
                value: {
                    contents: JSON.stringify(quorumSnapshot.proposals),
                    encoding: "utf-8",
                },
            },
            {
                mode: FileMode.File,
                path: "quorumValues",
                type: TreeEntry[TreeEntry.Blob],
                value: {
                    contents: JSON.stringify(quorumSnapshot.values),
                    encoding: "utf-8",
                },
            },
            {
                mode: FileMode.File,
                path: "attributes",
                type: TreeEntry[TreeEntry.Blob],
                value: {
                    contents: JSON.stringify(documentAttributes),
                    encoding: "utf-8",
                },
            },
        ];

        const [protocolTree, appSummaryTree] = await Promise.all([
            this.storage.createTree({ entries, id: null }),
            this.storage.getTree(content.handle, false),
        ]);

        // winston.info("SUMMARY IS");
        // winston.info(JSON.stringify(entries, null, 2));

        // winston.info("TREE");
        // winston.info(JSON.stringify(appSummaryTree, null, 2));

        // Combine the app summary with .protocol
        const newTreeEntries = appSummaryTree.tree.map((value) => {
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
            path: ".protocol",
            sha: protocolTree.sha,
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

        // TODO: Issue-3547 Logger abstraction in lambdas for routerlicious and Push
        // winston.info(`END Summary! ${JSON.stringify(content)}`);
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
