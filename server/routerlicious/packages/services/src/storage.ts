/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICommit, ICommitDetails, ICreateTreeEntry, ICreateCommitParams } from "@microsoft/fluid-gitresources";
import {
    IDocumentAttributes,
    IDocumentSystemMessage,
    MessageType,
    FileMode,
    TreeEntry,
    ITreeEntry,
    ICommittedProposal,
    ISummaryTree,
    SummaryObject,
    SummaryType,
} from "@microsoft/fluid-protocol-definitions";
import { IGitCache, IGitManager } from "@microsoft/fluid-server-services-client";
import {
    ICollection,
    IDatabaseManager,
    IDocumentDetails,
    IDocumentStorage,
    IForkOperation,
    IProducer,
    IRawOperationMessage,
    IScribe,
    ITenantManager,
    RawOperationType,
    IExperimentalDocumentStorage,
} from "@microsoft/fluid-server-services-core";
import * as moniker from "moniker";
import * as winston from "winston";

const StartingSequenceNumber = 0;
// Disabling so can tag inline but keep strong typing
// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
const DefaultScribe = JSON.stringify({
    logOffset: -1,
    minimumSequenceNumber: -1,
    protocolState: undefined,
    sequenceNumber: -1,
} as IScribe);

export class DocumentStorage implements IDocumentStorage, IExperimentalDocumentStorage {

    public readonly isExperimentalDocumentStorage = true;
    constructor(
        private readonly databaseManager: IDatabaseManager,
        private readonly tenantManager: ITenantManager,
        private readonly producer: IProducer) {
    }

    /**
     * Retrieves database details for the given document
     */
    public async getDocument(tenantId: string, documentId: string): Promise<any> {
        const collection = await this.databaseManager.getDocumentCollection();
        return collection.findOne({ documentId, tenantId });
    }

    public async getOrCreateDocument(tenantId: string, documentId: string): Promise<IDocumentDetails> {
        const getOrCreateP = this.getOrCreateObject(tenantId, documentId);

        return getOrCreateP;
    }

    public async createDocument(
        tenantId: string,
        documentId: string,
        summary: ISummaryTree,
        sequenceNumber: number,
        values: [string, ICommittedProposal][],
    ) {
        const tenant = await this.tenantManager.getTenant(tenantId);
        const gitManager = tenant.gitManager;

        // At this point the summary op and its data are all valid and we can perform the write to history
        const documentAttributes: IDocumentAttributes = {
            branch: documentId,
            minimumSequenceNumber: sequenceNumber,
            sequenceNumber,
        };

        const handle = await this.writeSummaryObject(gitManager, summary, "");

        const entries: ITreeEntry[] = [
            {
                mode: FileMode.File,
                path: "quorumMembers",
                type: TreeEntry[TreeEntry.Blob],
                value: {
                    contents: JSON.stringify([]),
                    encoding: "utf-8",
                },
            },
            {
                mode: FileMode.File,
                path: "quorumProposals",
                type: TreeEntry[TreeEntry.Blob],
                value: {
                    contents: JSON.stringify([]),
                    encoding: "utf-8",
                },
            },
            {
                mode: FileMode.File,
                path: "quorumValues",
                type: TreeEntry[TreeEntry.Blob],
                value: {
                    contents: JSON.stringify(values),
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
            gitManager.createTree({ entries, id: null }),
            gitManager.getTree(handle, false),
        ]);

        winston.info(JSON.stringify(protocolTree));
        winston.info(JSON.stringify(appSummaryTree));

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

        const gitTree = await gitManager.createGitTree({ tree: newTreeEntries });
        const commitParams: ICreateCommitParams = {
            author: {
                date: new Date().toISOString(),
                email: "praguertdev@microsoft.com",
                name: "Routerlicious Service",
            },
            message: "New document",
            parents: [],
            tree: gitTree.sha,
        };

        const commit = await gitManager.createCommit(commitParams);
        await gitManager.createRef(documentId, commit.sha);

        winston.info(JSON.stringify(documentId));
        winston.info(JSON.stringify(commit.sha));

        const scribe: IScribe = {
            logOffset: -1,
            minimumSequenceNumber: sequenceNumber,
            protocolState: {
                members: [],
                minimumSequenceNumber: sequenceNumber,
                proposals: [],
                sequenceNumber,
                values,
            },
            sequenceNumber,
        };

        const collection = await this.databaseManager.getDocumentCollection();
        const result = await collection.findOrCreate(
            {
                documentId,
                tenantId,
            },
            {
                branchMap: undefined,
                clients: undefined,
                createTime: Date.now(),
                documentId,
                forks: [],
                logOffset: undefined,
                parent: null,
                scribe: JSON.stringify(scribe),
                sequenceNumber,
                tenantId,
            });

        return result;
    }

    public async getLatestVersion(tenantId: string, documentId: string): Promise<ICommit> {
        const versions = await this.getVersions(tenantId, documentId, 1);
        if (!versions.length) {
            return null;
        }

        const latest = versions[0];
        return {
            author: latest.commit.author,
            committer: latest.commit.committer,
            message: latest.commit.message,
            parents: latest.parents,
            sha: latest.sha,
            tree: latest.commit.tree,
            url: latest.url,
        };
    }

    public async getVersions(tenantId: string, documentId: string, count: number): Promise<ICommitDetails[]> {
        const tenant = await this.tenantManager.getTenant(tenantId);
        const gitManager = tenant.gitManager;

        return gitManager.getCommits(documentId, count);
    }

    public async getVersion(tenantId: string, documentId: string, sha: string): Promise<ICommit> {
        const tenant = await this.tenantManager.getTenant(tenantId);
        const gitManager = tenant.gitManager;

        return gitManager.getCommit(sha);
    }

    public async getFullTree(tenantId: string, documentId: string): Promise<{ cache: IGitCache, code: string }> {
        const tenant = await this.tenantManager.getTenant(tenantId);
        const versions = await tenant.gitManager.getCommits(documentId, 1);
        if (versions.length === 0) {
            return { cache: { blobs: [], commits: [], refs: { [documentId]: null }, trees: [] }, code: null };
        }

        const fullTree = await tenant.gitManager.getFullTree(versions[0].sha);

        let code: string = null;
        if (fullTree.quorumValues) {
            let quorumValues;
            for (const blob of fullTree.blobs) {
                if (blob.sha === fullTree.quorumValues) {
                    quorumValues = JSON.parse(Buffer.from(blob.content, blob.encoding).toString()) as
                        [string, { value: string }][];

                    for (const quorumValue of quorumValues) {
                        if (quorumValue[0] === "code") {
                            code = quorumValue[1].value;
                            break;
                        }
                    }

                    break;
                }
            }
        }

        return {
            cache: {
                blobs: fullTree.blobs,
                commits: fullTree.commits,
                refs: { [documentId]: versions[0].sha },
                trees: fullTree.trees,
            },
            code,
        };
    }

    /**
     * Retrieves the forks for the given document
     */
    public async getForks(tenantId: string, documentId: string): Promise<string[]> {
        const collection: ICollection<any> = await this.databaseManager.getDocumentCollection();
        const document = await collection.findOne({ documentId, tenantId });

        return document.forks || [];
    }

    public async createFork(tenantId: string, id: string): Promise<string> {
        const name = moniker.choose();
        const tenant = await this.tenantManager.getTenant(tenantId);

        // Load in the latest snapshot
        const gitManager = tenant.gitManager;
        const head = await gitManager.getRef(id);

        let sequenceNumber: number;
        let minimumSequenceNumber: number;
        if (head === null) {
            // Set the Seq# and MSN# to StartingSequenceNumber
            minimumSequenceNumber = StartingSequenceNumber;
            sequenceNumber = StartingSequenceNumber;
        } else {
            // Create a new commit, referecing the ref head, but swap out the metadata to indicate the branch details
            const attributesContentP = gitManager.getContent(head.object.sha, ".attributes");
            const branchP = gitManager.upsertRef(name, head.object.sha);
            const [attributesContent] = await Promise.all([attributesContentP, branchP]);

            const attributesJson = Buffer.from(attributesContent.content, "base64").toString("utf-8");
            const attributes = JSON.parse(attributesJson) as IDocumentAttributes;
            minimumSequenceNumber = attributes.minimumSequenceNumber;
            sequenceNumber = attributes.sequenceNumber;
        }

        // Access to the documents collection to update the route tables
        const collection = await this.databaseManager.getDocumentCollection();

        // Insert the fork entry and update the parent to prep storage for both objects
        const insertFork = collection.insertOne(
            {
                branchMap: undefined,
                clients: undefined,
                createTime: Date.now(),
                documentId: name,
                forks: [],
                logOffset: undefined,
                parent: {
                    documentId: id,
                    minimumSequenceNumber,
                    sequenceNumber,
                    tenantId,
                },
                scribe: DefaultScribe,
                sequenceNumber,
                tenantId,
            });
        const updateParent = await collection.update(
            {
                documentId: id,
                tenantId,
            },
            null,
            {
                forks: { documentId: name, tenantId },
            });
        await Promise.all([insertFork, updateParent]);

        // Notify the parent branch of the fork and the desire to integrate changes
        await this.sendIntegrateStream(
            tenantId,
            id,
            sequenceNumber,
            minimumSequenceNumber,
            name,
            this.producer);

        return name;
    }

    private async getOrCreateObject(tenantId: string, documentId: string): Promise<IDocumentDetails> {
        const collection = await this.databaseManager.getDocumentCollection();
        const result = await collection.findOrCreate(
            {
                documentId,
                tenantId,
            },
            {
                branchMap: undefined,
                clients: undefined,
                createTime: Date.now(),
                documentId,
                forks: [],
                logOffset: undefined,
                parent: null,
                scribe: DefaultScribe,
                sequenceNumber: StartingSequenceNumber,
                tenantId,
            });

        return result;
    }

    /**
     * Sends a stream integration message which will forward messages after sequenceNumber from id to name.
     */
    private async sendIntegrateStream(
        tenantId: string,
        id: string,
        sequenceNumber: number,
        minSequenceNumber: number,
        name: string,
        producer: IProducer): Promise<void> {

        const contents: IForkOperation = {
            documentId: name,
            minSequenceNumber,
            sequenceNumber,
            tenantId,
        };

        const operation: IDocumentSystemMessage = {
            clientSequenceNumber: -1,
            contents: null,
            data: JSON.stringify(contents),
            referenceSequenceNumber: -1,
            traces: [],
            type: MessageType.Fork,
        };

        const integrateMessage: IRawOperationMessage = {
            clientId: null,
            documentId: id,
            operation,
            tenantId,
            timestamp: Date.now(),
            type: RawOperationType,
        };

        await producer.send([integrateMessage], tenantId, id);
    }

    private async writeSummaryObject(
        gitManager: IGitManager,
        value: SummaryObject,
        path: string,
    ): Promise<string> {
        switch (value.type) {
            case SummaryType.Blob: {
                const content = typeof value.content === "string" ? value.content : value.content.toString("base64");
                const encoding = typeof value.content === "string" ? "utf-8" : "base64";

                const blob = await gitManager.createBlob(content, encoding);
                return blob.sha;
            }
            case SummaryType.Tree: {
                const fullTree = value.tree;
                const entries = await Promise.all(Object.keys(fullTree).map(async (key) => {
                    const entry = fullTree[key];
                    const pathHandle = await this.writeSummaryObject(
                        gitManager,
                        entry,
                        `${path}/${encodeURIComponent(key)}`);
                    const treeEntry: ICreateTreeEntry = {
                        mode: this.getGitMode(entry),
                        path: encodeURIComponent(key),
                        sha: pathHandle,
                        type: this.getGitType(entry),
                    };
                    return treeEntry;
                }));

                const treeHandle = await gitManager.createGitTree({ tree: entries });
                return treeHandle.sha;
            }

            default:
                return Promise.reject();
        }
    }

    private getGitMode(value: SummaryObject): string {
        const type = value.type === SummaryType.Handle ? value.handleType : value.type;
        switch (type) {
            case SummaryType.Blob:
                return FileMode.File;
            case SummaryType.Commit:
                return FileMode.Commit;
            case SummaryType.Tree:
                return FileMode.Directory;
            default:
                throw new Error();
        }
    }

    private getGitType(value: SummaryObject): string {
        const type = value.type === SummaryType.Handle ? value.handleType : value.type;

        switch (type) {
            case SummaryType.Blob:
                return "blob";
            case SummaryType.Commit:
                return "commit";
            case SummaryType.Tree:
                return "tree";
            default:
                throw new Error();
        }
    }
}
