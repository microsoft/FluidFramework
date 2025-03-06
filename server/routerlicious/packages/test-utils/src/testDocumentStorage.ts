/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ICommit,
	ICommitDetails,
	ICreateCommitParams,
	ICreateTreeEntry,
} from "@fluidframework/gitresources";
import { gitHashFile, IsoBuffer, Uint8ArrayToString } from "@fluidframework/server-common-utils";
import {
	IGitCache,
	IGitManager,
	ISession,
	getQuorumTreeEntries,
	mergeAppAndProtocolTree,
} from "@fluidframework/server-services-client";
import {
	IDatabaseManager,
	IDeliState,
	IDocument,
	IDocumentDetails,
	IDocumentStorage,
	IScribe,
	ITenantManager,
} from "@fluidframework/server-services-core";
import {
	ISummaryTree,
	ICommittedProposal,
	ITreeEntry,
	SummaryType,
	ISnapshotTreeEx,
	SummaryObject,
	FileMode,
} from "@fluidframework/protocol-definitions";
import { IQuorumSnapshot, getGitMode, getGitType } from "@fluidframework/protocol-base";

// Forked from DocumentStorage to remove to server dependencies and enable testing of other data stores.
/**
 * @internal
 */
export class TestDocumentStorage implements IDocumentStorage {
	constructor(
		private readonly databaseManager: IDatabaseManager,
		private readonly tenantManager: ITenantManager,
	) {}

	/**
	 * Retrieves database details for the given document
	 */
	public async getDocument(tenantId: string, documentId: string): Promise<IDocument | null> {
		const collection = await this.databaseManager.getDocumentCollection();
		return collection.findOne({ documentId, tenantId });
	}

	public async getOrCreateDocument(
		tenantId: string,
		documentId: string,
	): Promise<IDocumentDetails> {
		const getOrCreateP = this.getOrCreateObject(tenantId, documentId);

		return getOrCreateP;
	}

	public async createDocument(
		tenantId: string,
		documentId: string,
		summary: ISummaryTree,
		sequenceNumber: number,
		initialHash: string,
		ordererUrl: string,
		historianUrl: string,
		deltaStreamUrl: string,
		values: [string, ICommittedProposal][],
		enableDiscovery: boolean = false,
	): Promise<IDocumentDetails> {
		const gitManager = await this.tenantManager.getTenantGitManager(tenantId, documentId);

		const blobsShaCache = new Set<string>();
		const handle = await writeSummaryTree(gitManager, summary, blobsShaCache, undefined);

		// At this point the summary op and its data are all valid and we can perform the write to history
		const quorumSnapshot: IQuorumSnapshot = {
			members: [],
			proposals: [],
			values,
		};
		const entries: ITreeEntry[] = getQuorumTreeEntries(
			sequenceNumber,
			sequenceNumber,
			quorumSnapshot,
		);

		const [protocolTree, appSummaryTree] = await Promise.all([
			gitManager.createTree({ entries }),
			gitManager.getTree(handle, false),
		]);

		// Combine the app summary with .protocol
		const newTreeEntries = mergeAppAndProtocolTree(appSummaryTree, protocolTree);

		const gitTree = await gitManager.createGitTree({ tree: newTreeEntries });
		const commitParams: ICreateCommitParams = {
			author: {
				date: new Date().toISOString(),
				email: "dummy@microsoft.com",
				name: "Routerlicious Service",
			},
			message: "New document",
			parents: [],
			tree: gitTree.sha,
		};

		const commit = await gitManager.createCommit(commitParams);
		await gitManager.createRef(documentId, commit.sha);

		const deli: IDeliState = {
			clients: undefined,
			durableSequenceNumber: sequenceNumber,
			expHash1: initialHash,
			logOffset: -1,
			sequenceNumber,
			signalClientConnectionNumber: 0,
			lastSentMSN: 0,
			nackMessages: undefined,
			checkpointTimestamp: Date.now(),
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
			validParentSummaries: undefined,
			isCorrupt: false,
			protocolHead: undefined,
			checkpointTimestamp: Date.now(),
		};

		const collection = await this.databaseManager.getDocumentCollection();

		const session: ISession = {
			ordererUrl,
			historianUrl,
			deltaStreamUrl,
			isSessionAlive: true,
			isSessionActive: true,
		};

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
			},
		);

		return result;
	}

	public async getLatestVersion(tenantId: string, documentId: string): Promise<ICommit> {
		const versions = await this.getVersions(tenantId, documentId, 1);
		if (!versions.length) {
			throw new Error("No versions found");
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

	public async getVersions(
		tenantId: string,
		documentId: string,
		count: number,
	): Promise<ICommitDetails[]> {
		const gitManager = await this.tenantManager.getTenantGitManager(tenantId, documentId);

		return gitManager.getCommits(documentId, count);
	}

	public async getVersion(tenantId: string, documentId: string, sha: string): Promise<ICommit> {
		const gitManager = await this.tenantManager.getTenantGitManager(tenantId, documentId);

		return gitManager.getCommit(sha);
	}

	public async getFullTree(
		tenantId: string,
		documentId: string,
	): Promise<{ cache: IGitCache; code: string }> {
		throw new Error("Method not implemented.");
	}

	private async getOrCreateObject(
		tenantId: string,
		documentId: string,
	): Promise<IDocumentDetails> {
		const collection = await this.databaseManager.getDocumentCollection();
		const result = await collection.findOrCreate(
			{
				documentId,
				tenantId,
			},
			{
				createTime: Date.now(),
				deli: undefined,
				documentId,
				session: undefined,
				scribe: undefined,
				tenantId,
				version: "0.1",
			},
		);

		return result;
	}
}

/**
 * Writes the summary tree to storage.
 * @param manager - Git manager to write.
 * @param summaryTree - summary tree to be written to storage.
 * @param blobsShaCache - cache so that duplicate blobs are written only once.
 * @param snapshot - snapshot tree.
 * @internal
 */
export async function writeSummaryTree(
	manager: IGitManager,
	summaryTree: ISummaryTree,
	blobsShaCache: Set<string>,
	snapshot: ISnapshotTreeEx | undefined,
): Promise<string> {
	const entries = await Promise.all(
		Object.keys(summaryTree.tree).map(async (key) => {
			const entry = summaryTree.tree[key];
			const pathHandle = await writeSummaryTreeObject(
				manager,
				blobsShaCache,
				key,
				entry,
				snapshot,
			);
			const treeEntry: ICreateTreeEntry = {
				mode: getGitMode(entry),
				path: encodeURIComponent(key),
				sha: pathHandle,
				type: getGitType(entry),
			};
			return treeEntry;
		}),
	);

	if (summaryTree.groupId !== undefined) {
		const groupId = summaryTree.groupId;
		const groupIdBlobHandle = await writeSummaryBlob(groupId, blobsShaCache, manager);
		entries.push({
			mode: FileMode.File,
			path: encodeURIComponent(".groupId"),
			sha: groupIdBlobHandle,
			type: "blob",
		});
	}

	const treeHandle = await manager.createGitTree({ tree: entries });
	return treeHandle.sha;
}

async function writeSummaryTreeObject(
	manager: IGitManager,
	blobsShaCache: Set<string>,
	key: string,
	object: SummaryObject,
	snapshot: ISnapshotTreeEx | undefined,
	currentPath = "",
): Promise<string> {
	switch (object.type) {
		case SummaryType.Blob: {
			return writeSummaryBlob(object.content, blobsShaCache, manager);
		}
		case SummaryType.Handle: {
			if (snapshot === undefined) {
				throw Error("Parent summary does not exist to reference by handle.");
			}
			return getIdFromPath(object.handleType, object.handle, snapshot);
		}
		case SummaryType.Tree: {
			return writeSummaryTree(manager, object, blobsShaCache, snapshot?.trees[key]);
		}
		case SummaryType.Attachment: {
			return object.id;
		}
		default:
			throw Error("Unreachable case");
	}
}

function getIdFromPath(
	handleType: SummaryType,
	handlePath: string,
	fullSnapshot: ISnapshotTreeEx,
): string {
	const path = handlePath.split("/").map((part) => decodeURIComponent(part));
	if (path[0] === "") {
		// root of tree should be unnamed
		path.shift();
	}

	return getIdFromPathCore(handleType, path, fullSnapshot);
}

function getIdFromPathCore(
	handleType: SummaryType,
	path: string[],
	snapshot: ISnapshotTreeEx,
): string {
	const key = path[0];
	if (path.length === 1) {
		switch (handleType) {
			case SummaryType.Blob: {
				return snapshot.blobs[key];
			}
			case SummaryType.Tree: {
				return snapshot.trees[key]?.id;
			}
			default:
				throw Error(`Unexpected handle summary object type: "${handleType}".`);
		}
	}
	return getIdFromPathCore(handleType, path.slice(1), snapshot);
}

async function writeSummaryBlob(
	content: string | Uint8Array,
	blobsShaCache: Set<string>,
	manager: IGitManager,
): Promise<string> {
	const { parsedContent, encoding } =
		typeof content === "string"
			? { parsedContent: content, encoding: "utf-8" }
			: { parsedContent: Uint8ArrayToString(content, "base64"), encoding: "base64" };

	// The gitHashFile would return the same hash as returned by the server as blob.sha
	const hash = await gitHashFile(IsoBuffer.from(parsedContent, encoding));
	if (!blobsShaCache.has(hash)) {
		const blob = await manager.createBlob(parsedContent, encoding);
		blobsShaCache.add(blob.sha);
	}
	return hash;
}
