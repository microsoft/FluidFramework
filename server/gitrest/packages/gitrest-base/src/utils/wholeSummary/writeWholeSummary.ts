/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICreateCommitParams, IRef } from "@fluidframework/gitresources";
import {
	IWholeFlatSummary,
	IWholeSummaryPayload,
	IWriteSummaryResponse,
} from "@fluidframework/server-services-client";
import { IFullGitTree, ISummaryVersion, IWholeSummaryOptions } from "./definitions";
import { convertFullGitTreeToFullSummaryTree } from "./conversions";
import { computeLowIoSummaryTreeEntries } from "./lowIoWriteUtils";
import {
	IWriteSummaryTreeOptions,
	writeSummaryTree as writeSummaryTreeCore,
} from "./coreWriteUtils";

/**
 * Feature flags for writing summaries.
 */
export interface ISummaryWriteFeatureFlags {
	/**
	 * WARNING: this option is highly optimized for read/write performance when using a storage solution
	 * with high overhead on individual read/writes, and it has a serious impact on storage space
	 * efficiency when maintaining all versions (summaries) of a document because Git cannot share blobs between
	 * summarie versions this way. For optimal results, it is recommended to only use this flag when writing an initial
	 * document summary, which is in the critical path for performance. Then future summaries will efficiently
	 * share unchanged blobs across versions as the summary size grows.
	 *
	 * Purpose: Uploading/downloading summaries from external filesystems using "Shredded Summary"
	 * format can be very slow due to I/O overhead. Enabling low I/O summary writing moves the majority
	 * of storage read/writes into memory and stores the resulting summary tree as a single blob in storage.
	 *
	 * Caveats: Low-io mode will likely use more memory than high-io when using a local FS,
	 * and as summary sizes grow, read/write speed worsens faster than in high-io mode. Low-io mode is not
	 * recommended when using a storage solution with low-overhead on individual read/writes.
	 *
	 * true: All summary writes will use low I/O mode
	 * false (default): No summary writes will use low I/O mode
	 * "initial": First summary write for a document will use low I/O mode
	 */
	enableLowIoWrite: "initial" | boolean;
	/**
	 * When writing a summary, we can skip or alter certain aspects of the summary write process
	 * to avoid unnecessary storage operations. This can improve performance when creating a new document.
	 */
	optimizeForInitialSummary: boolean;
}

/**
 * Information about a written summary used when crafting API response to consumer.
 */
export interface IWriteSummaryInfo {
	/**
	 * True if this is an initial summary for a new document.
	 */
	isNew: boolean;
	/**
	 * Response containing commit sha for "container" write or tree sha for "channel" write.
	 */
	writeSummaryResponse: IWriteSummaryResponse | IWholeFlatSummary;
}

/**
 * Check if the given payload is a container summary.
 */
export const isContainerSummary = (payload: IWholeSummaryPayload) => payload.type === "container";
/**
 * Check if the given payload is a channel summary.
 */
export const isChannelSummary = (payload: IWholeSummaryPayload) => payload.type === "channel";

/**
 * Retrieve the Git ref for the given documentId from storage.
 * Logically, this is a reference to the most recent commit (version) for the document.
 */
async function getDocRef(options: IWholeSummaryOptions): Promise<IRef | undefined> {
	const ref: IRef | undefined = await options.repoManager
		.getRef(`refs/heads/${options.documentId}`, { enabled: options.externalStorageEnabled })
		.catch(() => undefined);
	return ref;
}

/**
 * Write a summary tree as a Git tree in storage.
 * @returns the written git tree as an {@link IFullGitTree}, which contains all the tree entries, blob entries and their shas.
 */
async function writeSummaryTree(
	payload: IWholeSummaryPayload,
	documentRef: IRef | undefined,
	options: IWholeSummaryOptions & { precomputeFullTree: boolean; useLowIoWrite: boolean },
): Promise<IFullGitTree> {
	const writeSummaryTreeOptions: IWriteSummaryTreeOptions = {
		repoManager: options.repoManager,
		precomputeFullTree: options.precomputeFullTree,
		currentPath: "",
		enableLowIoWrite: options.useLowIoWrite,
		treeCache: {},
		blobCache: {},
		entryHandleToObjectShaCache: new Map<string, string>(),
	};

	if (options.useLowIoWrite) {
		const lowIoWriteSummaryTreeEntries = await computeLowIoSummaryTreeEntries(
			payload,
			documentRef,
			writeSummaryTreeOptions,
			options,
		);
		return writeSummaryTreeCore(lowIoWriteSummaryTreeEntries, writeSummaryTreeOptions);
	}
	return writeSummaryTreeCore(payload.entries, writeSummaryTreeOptions);
}

/**
 * Persist the given summary payload as a new git tree. This payload will not be referenced
 * by a commit or ref in the git repository until it is referenced in a container summary.
 */
export async function writeChannelSummary(
	payload: IWholeSummaryPayload,
	options: IWholeSummaryOptions,
	featureFlags: ISummaryWriteFeatureFlags,
): Promise<IWriteSummaryInfo> {
	const useLowIoWrite = featureFlags.enableLowIoWrite === true;
	// We need the document Ref to write channel with LowIo so that we can access pointers.
	const documentRef: IRef | undefined = useLowIoWrite ? await getDocRef(options) : undefined;
	const fullGitTree = await writeSummaryTree(payload, documentRef, {
		...options,
		precomputeFullTree: false,
		useLowIoWrite,
	});
	return {
		isNew: false,
		writeSummaryResponse: {
			id: fullGitTree.tree.sha,
		},
	};
}

/**
 * Create a new commit referencing the given tree.
 * Logically, this creates a new version ID for the document.
 */
async function createNewSummaryVersion(
	treeSha: string,
	parentCommitSha: string | undefined,
	isNewDocument: boolean,
	sequenceNumber: number,
	options: IWholeSummaryOptions,
): Promise<ISummaryVersion> {
	const commitMessage = isNewDocument
		? "New document"
		: // Checking client vs. service summary involves checking whether .protocol payload entry
		  // is a handle or value. At the moment, there is no real need for this message to distinguish the two.
		  `Summary @${sequenceNumber}`;
	const commitParams: ICreateCommitParams = {
		author: {
			date: new Date().toISOString(),
			email: "dummy@microsoft.com",
			name: "GitRest Service",
		},
		message: commitMessage,
		parents: parentCommitSha ? [parentCommitSha] : [],
		tree: treeSha,
	};
	const commit = await options.repoManager.createCommit(commitParams);
	return {
		id: commit.sha,
		treeId: treeSha,
	};
}

/**
 * Persist the given summary payload as a new git tree. The payload will be referenced by a new
 * commit which will be referenced by the document's ref.
 */
export async function writeContainerSummary(
	payload: IWholeSummaryPayload,
	isInitial: boolean,
	options: IWholeSummaryOptions,
	featureFlags: ISummaryWriteFeatureFlags,
): Promise<IWriteSummaryInfo> {
	// Ref will not exist for an initial summary, so do not bother checking.
	const documentRef: IRef | undefined =
		featureFlags.optimizeForInitialSummary && isInitial === true
			? undefined
			: await getDocRef(options);
	const isNewDocument = !documentRef && payload.sequenceNumber === 0;
	const useLowIoWrite =
		featureFlags.enableLowIoWrite === true ||
		(isNewDocument && featureFlags.enableLowIoWrite === "initial");
	const fullGitTree = await writeSummaryTree(payload, documentRef, {
		...options,
		precomputeFullTree: true,
		useLowIoWrite,
	});

	const { id: versionId, treeId } = await createNewSummaryVersion(
		fullGitTree.tree.sha,
		documentRef?.object.sha,
		isNewDocument,
		payload.sequenceNumber,
		options,
	);

	// eslint-disable-next-line unicorn/prefer-ternary
	if (documentRef) {
		await options.repoManager.patchRef(
			`refs/heads/${options.documentId}`,
			{
				force: true,
				sha: versionId,
			},
			{ enabled: options.externalStorageEnabled },
		);
	} else {
		await options.repoManager.createRef(
			{
				ref: `refs/heads/${options.documentId}`,
				sha: versionId,
				// Bypass internal check for ref existance if possible, because we already know the ref does not exist.
				force: true,
			},
			{ enabled: options.externalStorageEnabled },
		);
	}

	const fullSummaryTree = convertFullGitTreeToFullSummaryTree(fullGitTree);
	const wholeFlatSummary: IWholeFlatSummary = {
		id: versionId,
		trees: [
			{
				id: treeId,
				entries: fullSummaryTree.treeEntries,
				// We don't store sequence numbers in git
				sequenceNumber: undefined,
			},
		],
		blobs: fullSummaryTree.blobs,
	};

	return {
		isNew: isNewDocument,
		writeSummaryResponse: wholeFlatSummary,
	};
}
