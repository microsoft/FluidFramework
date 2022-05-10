/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fromBase64ToUtf8 } from "@fluidframework/common-utils";
import { ICreateCommitParams, ICreateTreeEntry } from "@fluidframework/gitresources";
import {
    generateServiceProtocolEntries,
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
    SummaryObject,
    SummaryType,
} from "@fluidframework/protocol-definitions";
import {
    buildTreePath,
    IGitManager,
    ISummaryTree,
    NetworkError,
    WholeSummaryUploadManager,
} from "@fluidframework/server-services-client";
import {
    ICollection,
    IScribe,
    ISequencedOperationMessage,
    requestWithRetry,
    shouldRetryNetworkError,
} from "@fluidframework/server-services-core";
import {
    CommonProperties,
    getLumberBaseProperties,
    Lumber,
    LumberEventName,
    Lumberjack,
} from "@fluidframework/server-services-telemetry";
import safeStringify from "json-stringify-safe";
import { ISummaryWriteResponse, ISummaryWriter } from "./interfaces";

/**
 * Git specific implementation of ISummaryWriter
 */
export class SummaryWriter implements ISummaryWriter {
    private readonly lumberProperties: Record<string, any>;
    constructor(
        private readonly tenantId: string,
        private readonly documentId: string,
        private readonly summaryStorage: IGitManager,
        private readonly opStorage: ICollection<ISequencedOperationMessage>,
        private readonly enableWholeSummaryUpload: boolean,
        private readonly maxRetriesOnError: number = 6,
    ) {
        this.lumberProperties = getLumberBaseProperties(this.documentId, this.tenantId);
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
     * @param checkpoint - State of the scribe service at current sequence number
     * @param pendingOps - List of unprocessed ops currently present in memory
     * @returns ISummaryWriteResponse; that represents the success or failure of the write, along with an
     * Ack or Nack message
     */
    /* eslint-disable max-len */
    public async writeClientSummary(
        op: ISequencedDocumentAugmentedMessage,
        lastSummaryHead: string | undefined,
        checkpoint: IScribe,
        pendingOps: ISequencedOperationMessage[],
    ): Promise<ISummaryWriteResponse> {
        const clientSummaryMetric = Lumberjack.newLumberMetric(LumberEventName.ClientSummary);
        this.setSummaryProperties(clientSummaryMetric, op);
        const content = JSON.parse(op.contents) as ISummaryContent;
        try {
            // The summary must reference the existing summary to be valid. This guards against accidental sends of
            // two summaries at the same time. In this case the first one wins.
            const existingRef = await requestWithRetry(
                async () => this.summaryStorage.getRef(encodeURIComponent(this.documentId)),
                "writeClientSummary_getRef",
                this.lumberProperties,
                shouldRetryNetworkError,
                this.maxRetriesOnError);

            if (content.head) {
                // In usual case, client always refers to last summaryAck so lastClientSummaryHead should always match.
                // However, the ack itself might be lost If scribe dies right after creating the summary. In that case,
                // the client code just fetches the last summary which should be the same as existingRef sha.
                if (!existingRef ||
                    (lastSummaryHead !== content.head && existingRef.object.sha !== content.head)) {
                    clientSummaryMetric.error(`Proposed parent summary does not match actual parent summary`);
                    return {
                        message: {
                            message: `Proposed parent summary "${content.head}" does not match actual parent summary "${existingRef ? existingRef.object.sha : "n/a"}".`,
                            summaryProposal: {
                                summarySequenceNumber: op.sequenceNumber,
                            },
                        },
                        status: false,
                    };
                }
            } else if (existingRef) {
                clientSummaryMetric.error(`Proposed parent summary does not match actual parent summary`);
                return {
                    message: {
                        message: `Proposed parent summary "${content.head}" does not match actual parent summary "${existingRef.object.sha}".`,
                        summaryProposal: {
                            summarySequenceNumber: op.sequenceNumber,
                        },
                    },
                    status: false,
                };
            }

            // When using git, we also validate whether the parent summary is valid
            if (!this.enableWholeSummaryUpload) {
                try {
                    await requestWithRetry(
                        async () => Promise.all(content.parents.map(async (parentSummary) => this.summaryStorage.getCommit(parentSummary))),
                        "writeClientSummary_validateParentSummary",
                        this.lumberProperties,
                        shouldRetryNetworkError,
                        this.maxRetriesOnError);
                } catch (e) {
                    clientSummaryMetric.error(`One or more parent summaries are invalid`, e);
                    return {
                        message: {
                            message: "One or more parent summaries are invalid",
                            summaryProposal: {
                                summarySequenceNumber: op.sequenceNumber,
                            },
                        },
                        status: false,
                    };
                }
            }

            // We should not accept this summary if it is less than current protocol sequence number
            if (op.referenceSequenceNumber < checkpoint.protocolState.sequenceNumber) {
                clientSummaryMetric.error(`Proposed summary reference sequence number less than current sequence number`);
                return {
                    message: {
                        message: `Proposed summary reference sequence number ${op.referenceSequenceNumber} is less than current sequence number ${checkpoint.protocolState.sequenceNumber}`,
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
                    checkpoint.protocolState.minimumSequenceNumber,
                    checkpoint.protocolState.sequenceNumber,
                    op.term ?? 1,
                    checkpoint.protocolState);

            // Generate a tree of logTail starting from protocol sequence number to summarySequenceNumber
            const logTailEntries = await requestWithRetry(
                async () => this.generateLogtailEntries(checkpoint.protocolState.sequenceNumber, op.sequenceNumber + 1, pendingOps),
                "writeClientSummary_generateLogtailEntries",
                this.lumberProperties,
                shouldRetryNetworkError,
                this.maxRetriesOnError);

            // Create service protocol entries combining scribe and deli states.
            const serviceProtocolEntries = generateServiceProtocolEntries(
                op.additionalContent,
                JSON.stringify(checkpoint));

            let uploadHandle: string = "";

            if (this.enableWholeSummaryUpload) {
                uploadHandle = await requestWithRetry(
                    async () => this.updateWholeSummary(
                        content.head,
                        content.handle,
                        protocolEntries,
                        logTailEntries,
                        serviceProtocolEntries,
                        checkpoint.protocolState.sequenceNumber,
                        content.details?.includesProtocolTree),
                    "writeClientSummary_updateWholeSummary",
                    this.lumberProperties,
                    shouldRetryNetworkError,
                    this.maxRetriesOnError);
            } else {
                const [logTailTree, protocolTree, serviceProtocolTree, appSummaryTree] = await Promise.all([
                    requestWithRetry(
                        async () => this.summaryStorage.createTree({ entries: logTailEntries }),
                        "writeClientSummary_createLogTailTree",
                        this.lumberProperties,
                        shouldRetryNetworkError,
                        this.maxRetriesOnError),
                    requestWithRetry(
                        async () => this.summaryStorage.createTree({ entries: protocolEntries }),
                        "writeClientSummary_createProtocolTree",
                        this.lumberProperties,
                        shouldRetryNetworkError,
                        this.maxRetriesOnError),
                    requestWithRetry(
                        async () => this.summaryStorage.createTree({ entries: serviceProtocolEntries }),
                        "writeClientSummary_createServiceProtocolTree",
                        this.lumberProperties,
                        shouldRetryNetworkError,
                        this.maxRetriesOnError),
                    requestWithRetry(
                        async () => this.summaryStorage.getTree(content.handle, false),
                        "writeClientSummary_getAppSummaryTree",
                        this.lumberProperties,
                        shouldRetryNetworkError,
                        this.maxRetriesOnError),
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

                // Finally perform the write to git
                const gitTree = await requestWithRetry(
                    async () => this.summaryStorage.createGitTree({ tree: newTreeEntries }),
                    "writeClientSummary_createGitTree",
                    this.lumberProperties,
                    shouldRetryNetworkError,
                    this.maxRetriesOnError);

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

                const commit = await requestWithRetry(
                    async () => this.summaryStorage.createCommit(commitParams),
                    "writeClientSummary_createCommit",
                    this.lumberProperties,
                    shouldRetryNetworkError,
                    this.maxRetriesOnError);
                uploadHandle = commit.sha;

                if (existingRef) {
                    await requestWithRetry(
                        async () => this.summaryStorage.upsertRef(this.documentId, uploadHandle),
                        "writeClientSummary_upsertRef",
                        this.lumberProperties,
                        shouldRetryNetworkError,
                        this.maxRetriesOnError);
                } else {
                    await requestWithRetry(
                        async () => this.summaryStorage.createRef(this.documentId, uploadHandle),
                        "writeClientSummary_createRef",
                        this.lumberProperties,
                        shouldRetryNetworkError,
                        this.maxRetriesOnError);
                }
            }
            clientSummaryMetric.success(`Client summary success`);
            return {
                message: {
                    handle: uploadHandle,
                    summaryProposal: {
                        summarySequenceNumber: op.sequenceNumber,
                    },
                },
                status: true,
            };
        } catch (error: any) {
            clientSummaryMetric.error(`Client summary failed`, error);

            if (error instanceof Error && error?.name === "NetworkError") {
                const networkError = error as NetworkError;
                if (!networkError.isFatal) {
                    return {
                        message: {
                            message: `A non-fatal error happened when trying to write client summary. Error: ${safeStringify(networkError.details)}`,
                            summaryProposal: {
                                summarySequenceNumber: op.sequenceNumber,
                            },
                        },
                        status: false,
                    };
                }
            }
            throw error;
        }
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
        const serviceSummaryMetric = Lumberjack.newLumberMetric(LumberEventName.ServiceSummary);
        this.setSummaryProperties(serviceSummaryMetric, op);
        try {
            const existingRef = await requestWithRetry(
                async () => this.summaryStorage.getRef(encodeURIComponent(this.documentId)),
                "writeServiceSummary_getRef",
                this.lumberProperties,
                shouldRetryNetworkError,
                this.maxRetriesOnError);

            // Client assumes at least one app generated summary. To keep compatibility
            // for now, service summary requires at least one prior client generated summary.
            // TODO: With default createNew() flow, we can remove this check.
            if (!existingRef) {
                serviceSummaryMetric.error(`No prior summaries found`);
                return false;
            }

            if (!op.additionalContent) {
                // this is a mixed mode edge case that can occur if the "generateServiceSummary" config
                // was disabled in a previous deployment and is now enabled in the next one
                serviceSummaryMetric.error(`Additional content is not defined`);
                return false;
            }

            // Generate a tree of logTail starting from the last protocol state.
            const logTailEntries = await requestWithRetry(
                async () => this.generateLogtailEntries(
                    currentProtocolHead,
                    op.sequenceNumber + 1,
                    pendingOps),
                "writeServiceSummary_generateLogtailEntries",
                this.lumberProperties,
                shouldRetryNetworkError,
                this.maxRetriesOnError);

            // Create service protocol entries combining scribe and deli states.
            const serviceProtocolEntries = generateServiceProtocolEntries(
                op.additionalContent,
                JSON.stringify(checkpoint));

            if (this.enableWholeSummaryUpload) {
                await requestWithRetry(
                    async () => this.createWholeServiceSummary(
                        existingRef.object.sha,
                        logTailEntries,
                        serviceProtocolEntries,
                        op.sequenceNumber),
                    "writeServiceSummary_createWholeServiceSummary",
                    this.lumberProperties,
                    shouldRetryNetworkError,
                    this.maxRetriesOnError);
            } else {
                // Fetch the last commit and summary tree. Create new trees with logTail and serviceProtocol.
                const lastCommit = await requestWithRetry(
                    async () => this.summaryStorage.getCommit(existingRef.object.sha),
                    "writeServiceSummary_getCommit",
                    this.lumberProperties,
                    shouldRetryNetworkError,
                    this.maxRetriesOnError);
                const [logTailTree, serviceProtocolTree, lastSummaryTree] = await Promise.all([
                    requestWithRetry(
                        async () => this.summaryStorage.createTree({ entries: logTailEntries }),
                        "writeServiceSummary_createLogTailTree",
                        this.lumberProperties,
                        shouldRetryNetworkError,
                        this.maxRetriesOnError),
                    requestWithRetry(
                        async () => this.summaryStorage.createTree({ entries: serviceProtocolEntries }),
                        "writeServiceSummary_createServiceProtocolTree",
                        this.lumberProperties,
                        shouldRetryNetworkError,
                        this.maxRetriesOnError),
                    requestWithRetry(
                        async () => this.summaryStorage.getTree(lastCommit.tree.sha, false),
                        "writeServiceSummary_getLastSummaryTree",
                        this.lumberProperties,
                        shouldRetryNetworkError,
                        this.maxRetriesOnError),
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

                // Finally perform the write to git
                const gitTree = await requestWithRetry(
                    async () => this.summaryStorage.createGitTree({ tree: newTreeEntries }),
                    "writeServiceSummary_createGitTree",
                    this.lumberProperties,
                    shouldRetryNetworkError,
                    this.maxRetriesOnError);
                const commitParams: ICreateCommitParams = {
                    author: {
                        date: new Date().toISOString(),
                        email: "praguertdev@microsoft.com",
                        name: "Routerlicious Service",
                    },
                    message: `Service Summary @${op.sequenceNumber}`,
                    parents: [lastCommit.sha],
                    tree: gitTree.sha,
                };

                // Finally commit the service summary and update the ref.
                const commit = await requestWithRetry(
                    async () => this.summaryStorage.createCommit(commitParams),
                    "writeServiceSummary_createCommit",
                    this.lumberProperties,
                    shouldRetryNetworkError,
                    this.maxRetriesOnError);
                await requestWithRetry(
                    async () => this.summaryStorage.upsertRef(this.documentId, commit.sha),
                    "writeServiceSummary_upsertRef",
                    this.lumberProperties,
                    shouldRetryNetworkError,
                    this.maxRetriesOnError);
            }
            serviceSummaryMetric.success(`Service summary success`);
            return true;
        } catch (error) {
            serviceSummaryMetric.error(`Service summary failed`, error);
            if (error instanceof Error &&
                error?.name === "NetworkError" &&
                !(error as NetworkError).isFatal) {
                return false;
            }
            throw error;
        }
    }

    private setSummaryProperties(summaryMetric: Lumber<LumberEventName.ClientSummary | LumberEventName.ServiceSummary>
        , op: ISequencedDocumentAugmentedMessage) {
        summaryMetric.setProperties(getLumberBaseProperties(this.documentId, this.tenantId));
        summaryMetric.setProperties({
            [CommonProperties.clientId]: op.clientId,
            [CommonProperties.sequenceNumber]: op.sequenceNumber,
            [CommonProperties.minSequenceNumber]: op.minimumSequenceNumber,
        });
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

    // When 'includesProtocolTree' is set, client uploads two top level nodes: '.app' and '.protocol'.
    // For now, we are ignoring '.protocol' node and uploading our own version (TODO: validate what client uploads)
    // However, we still need to refer to '.app' node, which is done by pointing to 'handle/.app'.
    private async updateWholeSummary(
        parentHandle: string,
        appSummaryHandle: string,
        protocolEntries: ITreeEntry[],
        logTailEntries: ITreeEntry[],
        serviceProtocolEntries: ITreeEntry[],
        sequenceNumber: number,
        includesProtocolTree: boolean | undefined): Promise<string> {
        const fullTree: ISummaryTree = {
            type: SummaryType.Tree,
            tree: {
                ".protocol": this.createSummaryTreeFromEntry(protocolEntries),
                ".logTail": this.createSummaryTreeFromEntry(logTailEntries),
                ".serviceProtocol": this.createSummaryTreeFromEntry(serviceProtocolEntries),
                ".app": {
                    type: SummaryType.Handle,
                    handle: includesProtocolTree ? buildTreePath(appSummaryHandle, ".app") : appSummaryHandle,
                    handleType: SummaryType.Tree,
                    embedded: true,
                },
            },
        };
        const uploadManager = new WholeSummaryUploadManager(this.summaryStorage);
        const uploadHandle = await uploadManager.writeSummaryTree(fullTree, parentHandle, "container", sequenceNumber);
        return uploadHandle;
    }

    private async createWholeServiceSummary(
        parentHandle: string,
        logTailEntries: ITreeEntry[],
        serviceProtocolEntries: ITreeEntry[],
        sequenceNumber: number): Promise<string> {
        const fullTree: ISummaryTree = {
            type: SummaryType.Tree,
            tree: {
                ".logTail": this.createSummaryTreeFromEntry(logTailEntries),
                ".serviceProtocol": this.createSummaryTreeFromEntry(serviceProtocolEntries),
                ".protocol": { type: SummaryType.Handle, handle: ".protocol", handleType: SummaryType.Tree },
                ".app": { type: SummaryType.Handle, handle: ".app", handleType: SummaryType.Tree },
            },
        };
        const uploadManager = new WholeSummaryUploadManager(this.summaryStorage);
        const uploadHandle = await uploadManager.writeSummaryTree(fullTree, parentHandle, "container", sequenceNumber);
        return uploadHandle;
    }

    // We should optimize our API so that we don't have to do this conversion.
    private createSummaryTreeFromEntry(treeEntries: ITreeEntry[]): ISummaryTree {
        const tree = this.createSummaryTreeFromEntryCore(treeEntries);
        return {
            tree,
            type: SummaryType.Tree,
        };
    }

    private createSummaryTreeFromEntryCore(treeEntries: ITreeEntry[]): { [path: string]: SummaryObject; } {
        const tree: { [path: string]: SummaryObject; } = {};
        for (const treeEntry of treeEntries) {
            let summaryObject: SummaryObject;
            switch (treeEntry.type) {
                case TreeEntry.Attachment: {
                    summaryObject = {
                        type: SummaryType.Attachment,
                        id: treeEntry.value.id,
                    };
                    break;
                }
                case TreeEntry.Blob: {
                    summaryObject = {
                        type: SummaryType.Blob,
                        content: treeEntry.value.encoding === "base64" ?
                            fromBase64ToUtf8(treeEntry.value.contents) :
                            treeEntry.value.contents,
                    };
                    break;
                }
                case TreeEntry.Tree: {
                    summaryObject = {
                        type: SummaryType.Tree,
                        unreferenced: treeEntry.value.unreferenced,
                        tree: this.createSummaryTreeFromEntryCore(treeEntry.value.entries),
                    };
                    break;
                }
                default: {
                    throw new Error(`Unexpected TreeEntry type when converting ITreeEntry.`);
                }
            }

            tree[treeEntry.path] = summaryObject;
        }

        return tree;
    }
}
