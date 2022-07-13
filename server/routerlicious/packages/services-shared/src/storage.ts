/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICommit, ICommitDetails, ICreateCommitParams } from "@fluidframework/gitresources";
import {
    IDocumentAttributes,
    ICommittedProposal,
    ISequencedDocumentMessage,
    ISummaryTree,
    SummaryType,
} from "@fluidframework/protocol-definitions";
import {
    IGitCache,
    SummaryTreeUploadManager,
    WholeSummaryUploadManager,
    ISession,
} from "@fluidframework/server-services-client";
import {
    ICollection,
    IDeliState,
    IDatabaseManager,
    IDocumentDetails,
    IDocumentStorage,
    IScribe,
    ITenantManager,
    SequencedOperationType,
    IDocument,
    ISequencedOperationMessage,
} from "@fluidframework/server-services-core";
import * as winston from "winston";
import { toUtf8 } from "@fluidframework/common-utils";
import { BaseTelemetryProperties, Lumberjack } from "@fluidframework/server-services-telemetry";

export class DocumentStorage implements IDocumentStorage {
    constructor(
        private readonly databaseManager: IDatabaseManager,
        private readonly tenantManager: ITenantManager,
        private readonly enableWholeSummaryUpload: boolean,
    ) { }

    /**
     * Retrieves database details for the given document
     */
    public async getDocument(tenantId: string, documentId: string): Promise<IDocument> {
        const collection = await this.databaseManager.getDocumentCollection();
        return collection.findOne({ documentId, tenantId });
    }

    public async getOrCreateDocument(tenantId: string, documentId: string): Promise<IDocumentDetails> {
        const getOrCreateP = this.getOrCreateObject(tenantId, documentId);

        return getOrCreateP;
    }

    private createInitialProtocolTree(
        documentId: string,
        sequenceNumber: number,
        term: number,
        values: [string, ICommittedProposal][],
    ): ISummaryTree {
        const documentAttributes: IDocumentAttributes = {
            minimumSequenceNumber: sequenceNumber,
            sequenceNumber,
            term,
        };

        const summary: ISummaryTree = {
            tree: {
                attributes: {
                    content: JSON.stringify(documentAttributes),
                    type: SummaryType.Blob,
                },
                quorumMembers: {
                    content: JSON.stringify([]),
                    type: SummaryType.Blob,
                },
                quorumProposals: {
                    content: JSON.stringify([]),
                    type: SummaryType.Blob,
                },
                quorumValues: {
                    content: JSON.stringify(values),
                    type: SummaryType.Blob,
                },
            },
            type: SummaryType.Tree,
        };

        return summary;
    }

    private createFullTree(appTree: ISummaryTree, protocolTree: ISummaryTree): ISummaryTree {
        if (this.enableWholeSummaryUpload) {
            return {
                type: SummaryType.Tree,
                tree: {
                    ".protocol": protocolTree,
                    ".app": appTree,
                },
            };
        } else {
            return {
                type: SummaryType.Tree,
                tree: {
                    ".protocol": protocolTree,
                    ...appTree.tree,
                },
            };
        }
    }

    public async createDocument(
        tenantId: string,
        documentId: string,
        appTree: ISummaryTree,
        sequenceNumber: number,
        term: number,
        initialHash: string,
        ordererUrl: string,
        historianUrl: string,
        values: [string, ICommittedProposal][],
        enableDiscovery: boolean = false,
    ): Promise<IDocumentDetails> {
        const tenant = await this.tenantManager.getTenant(tenantId, documentId);
        const gitManager = tenant.gitManager;

        const messageMetaData = { documentId, tenantId };
        const lumberjackProperties = {
            [BaseTelemetryProperties.tenantId]: tenantId,
            [BaseTelemetryProperties.documentId]: documentId,
        };

        const protocolTree = this.createInitialProtocolTree(documentId, sequenceNumber, term, values);
        const fullTree = this.createFullTree(appTree, protocolTree);

        const blobsShaCache = new Map<string, string>();
        const uploadManager = this.enableWholeSummaryUpload ?
            new WholeSummaryUploadManager(gitManager) :
            new SummaryTreeUploadManager(gitManager, blobsShaCache, async () => undefined);
        const handle = await uploadManager.writeSummaryTree(fullTree, "", "container", 0);

        winston.info(`Tree reference: ${JSON.stringify(handle)}`, { messageMetaData });
        Lumberjack.info(`Tree reference: ${JSON.stringify(handle)}`, lumberjackProperties);

        if (!this.enableWholeSummaryUpload) {
            const commitParams: ICreateCommitParams = {
                author: {
                    date: new Date().toISOString(),
                    email: "dummy@microsoft.com",
                    name: "Routerlicious Service",
                },
                message: "New document",
                parents: [],
                tree: handle,
            };

            const commit = await gitManager.createCommit(commitParams);
            await gitManager.createRef(documentId, commit.sha);

            winston.info(`Commit sha: ${JSON.stringify(commit.sha)}`, { messageMetaData });
            Lumberjack.info(`Commit sha: ${JSON.stringify(commit.sha)}`, lumberjackProperties);
        }

        const deli: Omit<IDeliState, "epoch"> = {
            clients: undefined,
            durableSequenceNumber: sequenceNumber,
            expHash1: initialHash,
            logOffset: -1,
            sequenceNumber,
            signalClientConnectionNumber: 0,
            term: 1,
            lastSentMSN: 0,
            nackMessages: undefined,
            successfullyStartedLambdas: [],
        };

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
            lastClientSummaryHead: undefined,
            lastSummarySequenceNumber: 0,
        };

        const session: ISession = {
            ordererUrl,
            historianUrl,
            isSessionAlive: true,
        };

        const message: string = `Create session with enableDiscovery as ${enableDiscovery}: ${JSON.stringify(session)}`;
        winston.info(message, { messageMetaData });
        Lumberjack.info(message, lumberjackProperties);

        const collection = await this.databaseManager.getDocumentCollection();
        const result = await collection.findOrCreate(
            {
                documentId,
                tenantId,
            },
            {
                createTime: Date.now(),
                deli: JSON.stringify(deli),
                documentId,
                session,
                scribe: JSON.stringify(scribe),
                tenantId,
                version: "0.1",
            });

        return result;
    }

    public async getLatestVersion(tenantId: string, documentId: string): Promise<ICommit> {
        const versions = await this.getVersions(tenantId, documentId, 1);
        if (!versions.length) {
            return (null as unknown) as ICommit;
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
        const tenant = await this.tenantManager.getTenant(tenantId, documentId);
        const gitManager = tenant.gitManager;

        return gitManager.getCommits(documentId, count);
    }

    public async getVersion(tenantId: string, documentId: string, sha: string): Promise<ICommit> {
        const tenant = await this.tenantManager.getTenant(tenantId, documentId);
        const gitManager = tenant.gitManager;

        return gitManager.getCommit(sha);
    }

    public async getFullTree(tenantId: string, documentId: string): Promise<{ cache: IGitCache; code: string; }> {
        const tenant = await this.tenantManager.getTenant(tenantId, documentId);
        const versions = await tenant.gitManager.getCommits(documentId, 1);
        if (versions.length === 0) {
            return {
                cache: { blobs: [], commits: [], refs: { [documentId]: (null as unknown) as string }, trees: [] },
                code: (null as unknown) as string,
            };
        }

        const fullTree = await tenant.gitManager.getFullTree(versions[0].sha);

        let code: string = (null as unknown) as string;
        if (fullTree.quorumValues) {
            let quorumValues;
            for (const blob of fullTree.blobs) {
                if (blob.sha === fullTree.quorumValues) {
                    quorumValues = JSON.parse(toUtf8(blob.content, blob.encoding)) as
                        [string, { value: string; }][];

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

    private async createObject(
        collection: ICollection<IDocument>,
        tenantId: string,
        documentId: string,
        deli?: string,
        scribe?: string,
        session?: ISession): Promise<IDocument> {
        const value: IDocument = {
            createTime: Date.now(),
            deli: (deli as unknown) as string,
            documentId,
            session: (session as unknown) as ISession,
            scribe: (scribe as unknown) as string,
            tenantId,
            version: "0.1",
        };
        await collection.insertOne(value);
        return value;
    }

    // Looks up the DB and summary for the document.
    private async getOrCreateObject(tenantId: string, documentId: string): Promise<IDocumentDetails> {
        const collection = await this.databaseManager.getDocumentCollection();
        const document = await collection.findOne({ documentId, tenantId });
        if (document === null) {
            // Guard against storage failure. Returns false if storage is unresponsive.
            const foundInSummaryP = this.readFromSummary(tenantId, documentId).then((result) => {
                return result;
            }, (err) => {
                winston.error(`Error while fetching summary for ${tenantId}/${documentId}`);
                winston.error(err);
                const lumberjackProperties = {
                    [BaseTelemetryProperties.tenantId]: tenantId,
                    [BaseTelemetryProperties.documentId]: documentId,
                };
                Lumberjack.error(`Error while fetching summary`, lumberjackProperties);
                return false;
            });

            const inSummary = await foundInSummaryP;

            // Setting an empty string to deli and scribe denotes that the checkpoints should be loaded from summary.
            const value = inSummary ?
                await this.createObject(collection, tenantId, documentId, "", "") :
                await this.createObject(collection, tenantId, documentId);

            return {
                value,
                existing: inSummary,
            };
        } else {
            return {
                value: document,
                existing: true,
            };
        }
    }

    private async readFromSummary(tenantId: string, documentId: string): Promise<boolean> {
        const tenant = await this.tenantManager.getTenant(tenantId, documentId);
        const gitManager = tenant.gitManager;
        const existingRef = await gitManager.getRef(encodeURIComponent(documentId));
        if (existingRef) {
            // Fetch ops from logTail and insert into deltas collection.
            // TODO: Make the rest endpoint handle this case.
            const opsContent = await gitManager.getContent(existingRef.object.sha, ".logTail/logTail");
            const ops = JSON.parse(
                Buffer.from(
                    opsContent.content,
                    Buffer.isEncoding(opsContent.encoding) ? opsContent.encoding : undefined,
                ).toString(),
            ) as ISequencedDocumentMessage[];
            const dbOps: ISequencedOperationMessage[] = ops.map((op: ISequencedDocumentMessage) => {
                return {
                    documentId,
                    operation: op,
                    tenantId,
                    type: SequencedOperationType,
                    mongoTimestamp: new Date(op.timestamp),
                };
            });
            const opsCollection = await this.databaseManager.getDeltaCollection(tenantId, documentId);
            await opsCollection
                .insertMany(dbOps, false)
                .catch((error) => {
                    // Duplicate key errors are ignored
                    if (error.code !== 11000) {
                        // Needs to be a full rejection here
                        return Promise.reject(error);
                    }
                });
            winston.info(`Inserted ${dbOps.length} ops into deltas DB`);
            const lumberjackProperties = {
                [BaseTelemetryProperties.tenantId]: tenantId,
                [BaseTelemetryProperties.documentId]: documentId,
            };
            Lumberjack.info(`Inserted ${dbOps.length} ops into deltas DB`, lumberjackProperties);
            return true;
        } else {
            return false;
        }
    }
}
