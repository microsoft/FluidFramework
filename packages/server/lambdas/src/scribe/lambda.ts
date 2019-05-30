import {
    IProposal,
    ISequencedDocumentMessage,
    ISequencedDocumentSystemMessage,
    MessageType,
} from "@prague/container-definitions";
import { GitManager } from "@prague/services-client";
import {
    extractBoxcar,
    ICollection,
    IContext,
    IDocument,
    IKafkaMessage,
    IScribe,
    ISequencedOperationMessage,
    ITrackedProposal,
    SequencedOperationType,
} from "@prague/services-core";
import * as Deque from "double-ended-queue";
import * as _ from "lodash";
import * as winston from "winston";
import { SequencedLambda } from "../sequencedLambda";

interface IGitPackfileHandle {
    refs: Array<{ref: string; sha: string }>;
}

export class ScribeLambda extends SequencedLambda {
    private pendingSummaries: Deque<ITrackedProposal>;
    private lastOffset: number;

    constructor(
        context: IContext,
        private collection: ICollection<IDocument>,
        private document: IDocument,
        private storage: GitManager,
    ) {
        super(context);

        // initialize document.scribe if it doesn't exist
        if (!document.scribe) {
            document.scribe = {
                logOffset: -1,
                proposals: [],
            };
        }

        this.lastOffset = document.scribe.logOffset;

        // sort items so that they are in sequenceNumber order
        const proposals = document.scribe.proposals;
        proposals.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
        this.pendingSummaries = new Deque<ITrackedProposal>(proposals);
    }

    public async handlerCore(message: IKafkaMessage): Promise<void> {
        // Skip any log messages we have already processed. Can occur in the case Kafka needed to restart but
        // we had already checkpointed at a given offset.
        if (message.offset <= this.lastOffset) {
            return;
        }

        const boxcar = extractBoxcar(message);

        // The dirty bit will track whether we need to persist our tracked state to MongoDB
        let dirty = false;

        for (const baseMessage of boxcar.contents) {
            if (baseMessage.type === SequencedOperationType) {
                const value = baseMessage as ISequencedOperationMessage;
                const target = `${value.tenantId}/${value.documentId}`;

                // Track proposals
                if (this.isSystemMessage(value.operation)) {
                    const systemMessage = value.operation as ISequencedDocumentSystemMessage;

                    // I believe I just need to track - via Mongo or whatever - a summary op proposal as well
                    // as when the MSN for that document goes above the SN for the proposal

                    // When the MSN goes above the proposal then I do the ref swap

                    switch (value.operation.type) {
                        case MessageType.Propose:
                            const proposal = JSON.parse(systemMessage.contents) as IProposal;

                            if (proposal.key === "summary") {
                                // When this happens I need to start tracking it for the document and store in Mongo.
                                // When the MSN goes above the proposal # then I consider it valid and lock it in.
                                // At this point I go and do the write to historian.

                                // Will need to be able to lookup, for a tenant, the storage location, and then
                                // perform the ref updates.

                                const trackedProposal: ITrackedProposal = {
                                    proposal,
                                    rejections: 0,
                                    sequenceNumber: systemMessage.sequenceNumber,
                                };
                                this.pendingSummaries.push(trackedProposal);
                                dirty = true;
                            }

                            break;

                        case MessageType.Reject:
                            const rejection = JSON.parse(systemMessage.contents) as number;

                            for (let i = 0; i < this.pendingSummaries.length; i++) {
                                const item = this.pendingSummaries.get(i);
                                if (item.sequenceNumber === rejection) {
                                    item.rejections++;
                                    dirty = true;

                                    break;
                                }

                                if (item.sequenceNumber > rejection) {
                                    break;
                                }
                            }

                            break;

                        case MessageType.ClientJoin:
                            // const join = JSON.parse(systemMessage.data) as IClientJoin;
                            // break;
                        case MessageType.ClientLeave:
                            // const clientId = JSON.parse(systemMessage.data) as string;
                            // break;
                        default:
                            // non-core message type - ignored
                    }
                }

                while (this.pendingSummaries.length > 0 &&
                    this.pendingSummaries.peekFront().sequenceNumber <= value.operation.minimumSequenceNumber) {
                    const popped = this.pendingSummaries.pop();
                    if (popped.rejections === 0) {
                        winston.info(`${target} summary op accepted @ ${popped.sequenceNumber}`);
                        await this.summarize(popped);
                    }
                    dirty = true;
                }
            }
        }

        if (dirty) {
            const update: IScribe = {
                logOffset: message.offset,
                proposals: this.pendingSummaries.toArray(),
            };

            await this.collection.update(
                {
                    documentId: this.document.documentId,
                    tenantId: this.document.tenantId,
                },
                {
                    scribe: update,
                },
                null);
        }

        this.context.checkpoint(message.offset);
    }

    public close() {
        return;
    }

    private isSystemMessage(message: ISequencedDocumentMessage): boolean {
        switch (message.type) {
            case MessageType.ClientJoin:
            case MessageType.ClientLeave:
            case MessageType.Propose:
            case MessageType.Reject:
                return true;

            default:
                return false;
        }
    }

    private async summarize(proposal: ITrackedProposal): Promise<void> {
        winston.info(`Proposal! ${JSON.stringify(proposal)}`);

        // Things to do...
        // ... signal the ref change somehow

        // TODO this operation needs to run idempotently. Need to check to see if we have already updated the ref
        // and that the write invariants hold

        const summary = proposal.proposal.value as IGitPackfileHandle;
        for (const ref of summary.refs) {
            try {
                const existingRef = await this.storage.getRef(ref.ref);
                if (existingRef) {
                    await this.storage.upsertRef(ref.ref, ref.sha);
                } else {
                    await this.storage.createRef(ref.ref, ref.sha);
                }
            } catch (ex) {
                // Remove the catch once fully stable
                winston.error(ex);
            }
        }

        winston.info(`Summarized! ${JSON.stringify(proposal)}`);

        // Signal to redis the existance of the summary op or insert an op into the stream?
    }
}
