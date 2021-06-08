/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICreateCommitParams, ICreateTreeEntry, ITree } from "@fluidframework/gitresources";
import {
    generateServiceProtocolEntries,
    IQuorumSnapshot,
    getQuorumTreeEntries,
    mergeAppAndProtocolTree,
} from "@fluidframework/protocol-base";
import {
    ISequencedDocumentMessage,
    ISummaryContent,
    ITreeEntry,
    TreeEntry,
    FileMode,
    ISequencedDocumentAugmentedMessage,
    SummarySnapshotTreeEntry,
    ISummarySnapshotPayload,
    SummarySnapshotType,
} from "@fluidframework/protocol-definitions";
import {
    buildSnapshotTreeHierarchy,
    convertTreeToSnapshotTree,
    IGitManager } from "@fluidframework/server-services-client";
import {
    ICollection,
    IScribe,
    ISequencedOperationMessage,
} from "@fluidframework/server-services-core";
import winston from "winston";
import { ISummaryWriteResponse, ISummaryWriter } from "./interfaces";

/**
 * Git specific implementation of ISummaryWriter
 */
export class SummaryWriter implements ISummaryWriter {
    constructor(
        private readonly tenantId: string,
        private readonly documentId: string,
        private readonly summaryStorage: IGitManager,
        private readonly opStorage: ICollection<ISequencedOperationMessage>,
        private readonly singleSummaryUploadApi = true,
    ) {

    }

    /**
     * The flag indicates whether the actual storing process happens locally or externally. As writing to external
     * storage is an expensive process, a service provider may choose to use asynchronous out of process solution
     * such as a job queue. If set to 'true', the return value of writeClientSummary/writeServiceSummary will not
     * be used by the lambda. The external process will be responsible for sending the updates to the op stream.
     */
    public get isExternal(): boolean {
        return false;
    }

    /**
     * Helper function that finalizes the summary sent by client. After validating the summary op,
     * it appends .protocol, .serviceProtocol, and .logTail to the summary. Once done, it creates
     * a git summary, commits the change, and finalizes the ref.
     * @param op - Operation that triggered the write
     * @param lastSummaryHead - Points to the last summary head if available
     * @param protocolMinimumSequenceNumber - Minimum sequence number of current protocol state
     * @param protocolSequenceNumber - Sequence number of current protocol state
     * @param protocolSequenceNumber - State of quourum at protocol sequence number
     * @param checkpoint - State of the scribe service at current sequence number
     * @param pendingOps - List of unprocessed ops currently present in memory
     * @returns ISummaryWriteResponse; that represents the success or failure of the write, along with an
     * Ack or Nack message
     */
    /* eslint-disable max-len */
    public async writeClientSummary(
        op: ISequencedDocumentAugmentedMessage,
        lastSummaryHead: string | undefined,
        protocolMinimumSequenceNumber: number,
        protocolSequenceNumber: number,
        quorumSnapshot: IQuorumSnapshot,
        checkpoint: IScribe,
        pendingOps: ISequencedOperationMessage[],
    ): Promise<ISummaryWriteResponse> {
        const content = JSON.parse(op.contents) as ISummaryContent;

        // The summary must reference the existing summary to be valid. This guards against accidental sends of
        // two summaries at the same time. In this case the first one wins.
        const existingRef = await this.summaryStorage.getRef(encodeURIComponent(this.documentId));

        if (content.head) {
            // In usual case, client always refers to last summaryAck so lastClientSummaryHead should always match.
            // However, the ack itself might be lost If scribe dies right after creating the summary. In that case,
            // the client code just fetches the last summary which should be the same as existingRef sha.
            if (!existingRef ||
                (lastSummaryHead !== content.head && existingRef.object.sha !== content.head)) {
                return {
                    message: {
                        errorMessage: `Proposed parent summary "${content.head}" does not match actual parent summary "${existingRef ? existingRef.object.sha : "n/a"}".`,
                        summaryProposal: {
                            summarySequenceNumber: op.sequenceNumber,
                        },
                    },
                    status: false,
                };
            }
        } else if (existingRef) {
            return {
                message: {
                    errorMessage: `Proposed parent summary "${content.head}" does not match actual parent summary "${existingRef.object.sha}".`,
                    summaryProposal: {
                        summarySequenceNumber: op.sequenceNumber,
                    },
                },
                status: false,
            };
        }

        // We also validate that the parent summary is valid
        try {
            // eslint-disable-next-line @typescript-eslint/promise-function-async
            await Promise.all(content.parents.map((parentSummary) => this.summaryStorage.getCommit(parentSummary)));
        } catch (e) {
            return {
                message: {
                    errorMessage: "One or more parent summaries are invalid.",
                    summaryProposal: {
                        summarySequenceNumber: op.sequenceNumber,
                    },
                },
                status: false,
            };
        }

        // We should not accept a summary earlier than our current protocol state
        if (op.referenceSequenceNumber < protocolSequenceNumber) {
            return {
                message: {
                    errorMessage: `Proposed summary reference sequence number ${op.referenceSequenceNumber} is less than current sequence number ${op.sequenceNumber}`,
                    summaryProposal: {
                        summarySequenceNumber: op.sequenceNumber,
                    },
                },
                status: false,
            };
        }

        // At this point the summary op and its data are all valid and we can perform the write to history
        const protocolEntries: ITreeEntry[] =
            getQuorumTreeEntries(
                this.documentId,
                protocolMinimumSequenceNumber,
                protocolSequenceNumber,
                op.term ?? 1,
                quorumSnapshot);

        // Generate a tree of logTail starting from protocol sequence number to summarySequenceNumber
        const logTailEntries = await this.generateLogtailEntries(protocolSequenceNumber, op.sequenceNumber + 1, pendingOps);

        // Create service protocol entries combining scribe and deli states.
        const serviceProtocolEntries = generateServiceProtocolEntries(
            op.additionalContent,
            JSON.stringify(checkpoint));

        let clientSummaryId;
        if (this.singleSummaryUploadApi)
        {
            clientSummaryId = await this.uploadUpdatedSnapshot(
                content.handle,
                logTailEntries,
                serviceProtocolEntries,
                protocolEntries);
        }
        else
        {
            clientSummaryId = await this.uploadUpdatedSummary(
                content.handle,
                logTailEntries,
                serviceProtocolEntries,
                protocolEntries);
        }

        const commitParams: ICreateCommitParams = {
            author: {
                date: new Date().toISOString(),
                email: "praguertdev@microsoft.com",
                name: "Routerlicious Service",
            },
            message: content.message,
            parents: content.parents,
            tree: clientSummaryId,
        };

        const commit = await this.summaryStorage.createCommit(commitParams);

        if (existingRef) {
            await this.summaryStorage.upsertRef(this.documentId, commit.sha);
        } else {
            await this.summaryStorage.createRef(this.documentId, commit.sha);
        }

        return {
            message: {
                handle: commit.sha,
                summaryProposal: {
                    summarySequenceNumber: op.sequenceNumber,
                },
            },
            status: true,
        };
    }
    /* eslint-enable max-len */

    /**
     * Helper function that writes a new summary. Unlike client summaries, service summaries can be
     * triggered at any point in time. At first it fetches the last summary written by client. Once done,
     * it appends .protocol, .serviceProtocol, and .logTail to that summary. Finally it creates
     * a git summary, commits the change, and finalizes the ref.
     * @param op - Operation that triggered the write
     * @param currentProtocolHead - Protocol head of the last client summary.
     * @param checkpoint - State of the scribe service at current sequence number
     * @param pendingOps - List of unprocessed ops currently present in memory
     * @returns a boolean, which represents the success or failure of the write
     */
    public async writeServiceSummary(
        op: ISequencedDocumentAugmentedMessage,
        currentProtocolHead: number,
        checkpoint: IScribe,
        pendingOps: ISequencedOperationMessage[]): Promise<boolean> {
        const existingRef = await this.summaryStorage.getRef(encodeURIComponent(this.documentId));

        // Client assumes at least one app generated summary. To keep compatibility for now, service summary requires
        // at least one prior client generated summary.
        // TODO: With default createNew() flow, we can remove this check.
        if (!existingRef) {
            return false;
        }

        // Generate a tree of logTail starting from the last protocol state.
        const logTailEntries = await this.generateLogtailEntries(
            currentProtocolHead,
            op.sequenceNumber + 1,
            pendingOps);

        // Create service protocol entries combining scribe and deli states.
        const serviceProtocolEntries = generateServiceProtocolEntries(
            op.additionalContent,
            JSON.stringify(checkpoint));

        // Fetch the last commit and summary tree. Create new trees with logTail and serviceProtocol.
        const lastCommit = await this.summaryStorage.getCommit(existingRef.object.sha);

        let serviceSummaryId;
        if (this.singleSummaryUploadApi)
        {
            serviceSummaryId = await this.uploadUpdatedSnapshot(
                lastCommit.tree.sha,
                logTailEntries,
                serviceProtocolEntries);
        }
        else
        {
            serviceSummaryId = await this.uploadUpdatedSummary(
                lastCommit.tree.sha,
                logTailEntries,
                serviceProtocolEntries);
        }

        const commitParams: ICreateCommitParams = {
            author: {
                date: new Date().toISOString(),
                email: "praguertdev@microsoft.com",
                name: "Routerlicious Service",
            },
            message: `Service Summary @${op.sequenceNumber}`,
            parents: [lastCommit.sha],
            tree: serviceSummaryId,
        };

        // Finally commit the service summary and update the ref.
        const commit = await this.summaryStorage.createCommit(commitParams);
        await this.summaryStorage.upsertRef(this.documentId, commit.sha);

        return true;
    }

    private async uploadUpdatedSummary(
        handle: string,
        logTailEntries: ITreeEntry[],
        serviceProtocolEntries: ITreeEntry[],
        protocolEntries?: ITreeEntry[],
    ): Promise<string> {
        let newTreeEntries: ICreateTreeEntry[];
        const treesP: Promise<ITree>[] = [
            this.summaryStorage.getTree(handle, false),
            this.summaryStorage.createTree({ entries: serviceProtocolEntries }),
            this.summaryStorage.createTree({ entries: logTailEntries }),
        ];

        if (protocolEntries !== undefined)
        {
            treesP.push(this.summaryStorage.createTree({ entries: protocolEntries }));
        }

        const trees = await Promise.all(treesP);

        if (protocolEntries !== undefined)
        {
            // Combine the app summary with .protocol
            newTreeEntries = mergeAppAndProtocolTree(trees[0], trees[3]);
        }
        else
        {
            newTreeEntries = trees[0].tree.map((value) => {
                const createTreeEntry: ICreateTreeEntry = {
                    mode: value.mode,
                    path: value.path,
                    sha: value.sha,
                    type: value.type,
                };
                return createTreeEntry;
            });
        }

        // Now combine with .logtail and .serviceProtocol
        newTreeEntries.push({
            mode: FileMode.Directory,
            path: ".serviceProtocol",
            sha: trees[1].sha,
            type: "tree",
        });
        newTreeEntries.push({
            mode: FileMode.Directory,
            path: ".logTail",
            sha: trees[2].sha,
            type: "tree",
        });

        // Finally perform the write to git
        const gitTree = await this.summaryStorage.createGitTree({ tree: newTreeEntries });

        return gitTree.sha;
    }

    private async uploadUpdatedSnapshot(
        handle: string,
        logTailEntries: ITreeEntry[],
        serviceProtocolEntries: ITreeEntry[],
        protocolEntries?: ITreeEntry[],
    ): Promise<string> {
        const lastSummaryTree = await this.summaryStorage.getTree(handle, true);
        const summarySnapshot = buildSnapshotTreeHierarchy(lastSummaryTree);
        const summarySnapshotEntries = summarySnapshot.entries !== undefined ? summarySnapshot.entries : [];

        const serviceProtocolTree = await convertTreeToSnapshotTree({ entries: serviceProtocolEntries });
        const serviceProtocolEntry: SummarySnapshotTreeEntry = {
            type: "tree",
            path: ".serviceProtocol",
            value: serviceProtocolTree,
        };
        summarySnapshotEntries.push(serviceProtocolEntry);

        const logTailTree = await convertTreeToSnapshotTree({ entries: logTailEntries });
        const logTailEntry: SummarySnapshotTreeEntry = {
            type: "tree",
            path: ".logTail",
            value: logTailTree,
        };
        summarySnapshotEntries.push(logTailEntry);

        if (protocolEntries !== undefined)
        {
            const protocolTree = await convertTreeToSnapshotTree({ entries: protocolEntries });
            const protocolEntry: SummarySnapshotTreeEntry = {
                type: "tree",
                path: ".protocol",
                value: protocolTree,
            };
            summarySnapshotEntries.push(protocolEntry);
        }

        const snapshotPayload: ISummarySnapshotPayload = {
            entries: summarySnapshotEntries,
            type: SummarySnapshotType.Channel,
        };

        const id = this.summaryStorage.createSummary(snapshotPayload).then((response) => response.id);
        const summaryType = protocolEntries !== undefined ? "clientSummary" : "serviceSummary";
        winston.info(`[UPLOAD SUMMARY] Scribe ${summaryType}. \nPayload: ${snapshotPayload} \nResponse Id: ${id}`);

        return id;
    }

    private async generateLogtailEntries(
        from: number,
        to: number,
        pending: ISequencedOperationMessage[]): Promise<ITreeEntry[]> {
        const logTail = await this.getLogTail(from, to, pending);
        const logTailEntries: ITreeEntry[] = [
            {
                mode: FileMode.File,
                path: "logTail",
                type: TreeEntry.Blob,
                value: {
                    contents: JSON.stringify(logTail),
                    encoding: "utf-8",
                },
            },
        ];
        return logTailEntries;
    }

    private async getLogTail(
        gt: number,
        lt: number,
        pending: ISequencedOperationMessage[]): Promise<ISequencedDocumentMessage[]> {
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
            const logTail = await this.opStorage.find(query, { "operation.sequenceNumber": 1 });

            // If the db is not updated with all logs yet, get them from checkpoint messages.
            if (logTail.length !== (lt - gt - 1)) {
                const nextSeq = logTail.length === 0 ? gt : logTail[logTail.length - 1].operation.sequenceNumber + 1;
                for (const message of pending) {
                    if (message.operation.sequenceNumber >= nextSeq && message.operation.sequenceNumber < lt) {
                        logTail.push(message);
                    }
                }
            }
            return logTail.map((log) => log.operation);
        }
    }
}
