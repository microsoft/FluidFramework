/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IBlob,
	ICreateCommitParams,
	ICreateTreeEntry,
	IRef,
	ITree,
	ITreeEntry,
} from "@fluidframework/gitresources";
import {
	IWholeFlatSummary,
	IWholeSummaryBlob,
	IWholeSummaryPayload,
	IWholeSummaryTree,
	IWholeSummaryTreeHandleEntry,
	IWholeSummaryTreeValueEntry,
	IWriteSummaryResponse,
	NetworkError,
	WholeSummaryTreeEntry,
} from "@fluidframework/server-services-client";
import { Lumberjack } from "@fluidframework/server-services-telemetry";
import { getGitMode, getGitType } from "@fluidframework/protocol-base";
import { SummaryType } from "@fluidframework/protocol-definitions";
import { IRepositoryManager } from "../definitions";
import { MemFsManagerFactory } from "../filesystems";
import { IsomorphicGitManagerFactory } from "../isomorphicgitManager";
import { NullExternalStorageManager } from "../../externalStorageManager";
import { IFullGitTree, ISummaryVersion, IWholeSummaryOptions } from "./definitions";
import {
	buildFullGitTreeFromGitTree,
	convertFullGitTreeToFullSummaryTree,
	convertFullSummaryToWholeSummaryEntries,
	convertWholeSummaryTreeEntryToSummaryObject,
} from "./conversions";
import { Constants } from "./constants";
import { readSummary } from "./readWholeSummary";

/**
 * Feature flags for writing summaries.
 */
export interface ISummaryWriteOptions {
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

export const isContainerSummary = (payload: IWholeSummaryPayload) => payload.type === "container";
export const isChannelSummary = (payload: IWholeSummaryPayload) => payload.type === "channel";

async function getDocRef(options: IWholeSummaryOptions): Promise<IRef | undefined> {
	const ref: IRef | undefined = await options.repoManager
		.getRef(`refs/heads/${options.documentId}`, { enabled: options.externalStorageEnabled })
		.catch(() => undefined);
	return ref;
}

interface IWriteSummaryTreeOptions {
	repoManager: IRepositoryManager;
	precomputeFullTree: boolean;
	currentPath: string;
	enableLowIoWrite: boolean;
	treeCache: Record<string, ITree>;
	blobCache: Record<string, IBlob>;
	entryHandleToObjectShaCache: Map<string, string>;
}

async function writeFullGitTreeAsSummaryTree(
	fullGitTree: IFullGitTree,
	options: IWriteSummaryTreeOptions,
): Promise<string> {
	const fullSummaryTree = convertFullGitTreeToFullSummaryTree(fullGitTree);
	const wholeSummaryTreeEntries = convertFullSummaryToWholeSummaryEntries(fullSummaryTree);
	const tree = await writeSummaryTreeCore(wholeSummaryTreeEntries, options);
	return tree.tree.sha;
}

async function writeSummaryTreeBlob(
	blob: IWholeSummaryBlob,
	options: IWriteSummaryTreeOptions,
): Promise<string> {
	const blobResponse = await options.repoManager.createBlob({
		content: blob.content,
		encoding: blob.encoding,
	});
	const sha = blobResponse.sha;
	// Store blob in cache for use upstream
	options.blobCache[sha] = {
		content: blob.content,
		encoding: blob.encoding,
		sha,
		url: blobResponse.url,
		size: blob.content.length,
	};
	return sha;
}
async function writeSummaryTreeTree(
	tree: IWholeSummaryTree,
	options: IWriteSummaryTreeOptions,
): Promise<string> {
	const fullGitTree = await writeSummaryTreeCore(tree.entries ?? [], options);
	const sha = fullGitTree.tree.sha;
	options.treeCache[sha] = {
		sha,
		url: fullGitTree.tree.url,
		tree: fullGitTree.tree.tree,
	};
	return sha;
}

async function getShaFromTreeHandleEntry(
	entry: IWholeSummaryTreeHandleEntry,
	options: IWriteSummaryTreeOptions,
): Promise<string> {
	if (!entry.id) {
		throw new NetworkError(400, `Empty summary tree handle`);
	}
	if (entry.id.split("/").length === 1) {
		// The entry id is already a sha, so just return it
		return entry.id;
	}

	const cachedSha = options.entryHandleToObjectShaCache.get(entry.id);
	if (cachedSha) {
		return cachedSha;
	}

	// The entry is in the format { id: `<parent commit sha>/<tree path>`, path: `<tree path>` }
	const parentHandle = entry.id.split("/")[0];
	// Must use `this.repoManager` to ensure that we retrieve the shas from storage, not memory
	const parentCommit = await options.repoManager.getCommit(parentHandle);
	const parentTree = await options.repoManager.getTree(
		parentCommit.tree.sha,
		true /* recursive */,
	);
	const gitTree: IFullGitTree = await buildFullGitTreeFromGitTree(
		parentTree,
		options.repoManager,
		options.blobCache /* blobCache */,
		// Parse inner git tree blobs so that we can properly reference blob shas in new summary.
		true /* parseInnerFullGitTrees */,
		// We only need shas here, so don't waste resources retrieving blobs that are not included in fullGitTrees.
		false /* retrieveBlobs */,
	);
	if (gitTree.parsedFullTreeBlobs && options.enableLowIoWrite !== true) {
		// If the git tree/blob shas being referenced by a shredded summary write (high-io write) with handles
		// are hidden within a fullGitTree blob, we need to write those hidden blobs as individual trees/blobs
		// into storage so that they can be appropriately referenced by the uploaded summary tree.
		await writeFullGitTreeAsSummaryTree(gitTree, options);
	}
	for (const treeEntry of gitTree.tree.tree) {
		options.entryHandleToObjectShaCache.set(`${parentHandle}/${treeEntry.path}`, treeEntry.sha);
	}
	const sha = options.entryHandleToObjectShaCache.get(entry.id);
	if (!sha) {
		throw new NetworkError(
			404,
			`Summary tree handle object not found: id: ${entry.id}, path: ${entry.path}`,
		);
	}
	return sha;
}

async function writeSummaryTreeObject(
	wholeSummaryTreeEntry: WholeSummaryTreeEntry,
	options: IWriteSummaryTreeOptions,
): Promise<ICreateTreeEntry> {
	const summaryObject = convertWholeSummaryTreeEntryToSummaryObject(wholeSummaryTreeEntry);
	const type = getGitType(summaryObject);
	const path = wholeSummaryTreeEntry.path;
	const fullPath = options.currentPath
		? `${options.currentPath}/${wholeSummaryTreeEntry.path}`
		: wholeSummaryTreeEntry.path;
	const mode = getGitMode(summaryObject);

	let sha: string;
	// eslint-disable-next-line unicorn/prefer-switch
	if (summaryObject.type === SummaryType.Blob) {
		const blob = (wholeSummaryTreeEntry as IWholeSummaryTreeValueEntry)
			.value as IWholeSummaryBlob;
		sha = await writeSummaryTreeBlob(blob, options);
	} else if (summaryObject.type === SummaryType.Tree) {
		const tree = (wholeSummaryTreeEntry as IWholeSummaryTreeValueEntry)
			.value as IWholeSummaryTree;
		sha = await writeSummaryTreeTree(tree, { ...options, currentPath: fullPath });
	} else if (summaryObject.type === SummaryType.Handle) {
		sha = await getShaFromTreeHandleEntry(
			wholeSummaryTreeEntry as IWholeSummaryTreeHandleEntry,
			options,
		);
	} else {
		// Invalid/unimplemented summary object type
		throw new NetworkError(501, "Not Implemented");
	}

	const createEntry: ICreateTreeEntry = {
		mode,
		path,
		sha,
		type,
	};
	return createEntry;
}

async function precomputeFullGitTree(
	newlyCreatedTree: ITree,
	options: IWriteSummaryTreeOptions,
): Promise<IFullGitTree> {
	const retrieveEntries = async (tree: ITree, path: string = ""): Promise<ITreeEntry[]> => {
		const treeEntries: ITreeEntry[] = [];
		for (const treeEntry of tree.tree) {
			const entryPath = path ? `${path}/${treeEntry.path}` : treeEntry.path;
			treeEntries.push({
				...treeEntry,
				path: entryPath,
			});
			if (treeEntry.type === "tree") {
				const cachedTree: ITree | undefined = options.treeCache[treeEntry.sha];
				if (!cachedTree) {
					// This is likely caused by a Handle object in the written tree.
					// We must retrieve it to send a full summary back to historian.
					const missingTree = await options.repoManager.getTree(
						treeEntry.sha,
						true /* recursive */,
					);
					treeEntries.push(
						...missingTree.tree.map((entry) => ({
							...entry,
							path: `${entryPath}/${entry.path}`,
						})),
					);
				} else {
					treeEntries.push(...(await retrieveEntries(cachedTree, entryPath)));
				}
			}
		}
		return treeEntries;
	};
	const gitTreeEntries = await retrieveEntries(newlyCreatedTree);
	const computedGitTree: ITree = {
		sha: newlyCreatedTree.sha,
		url: newlyCreatedTree.url,
		tree: gitTreeEntries,
	};
	return buildFullGitTreeFromGitTree(
		computedGitTree,
		options.repoManager,
		options.blobCache,
		true /* parseInnerFullGitTrees */,
		true /* retrieveBlobs */,
	);
}

async function writeSummaryTreeCore(
	wholeSummaryTreeEntries: WholeSummaryTreeEntry[],
	options: IWriteSummaryTreeOptions,
): Promise<IFullGitTree> {
	const createTreeEntries: ICreateTreeEntry[] = await Promise.all(
		wholeSummaryTreeEntries.map(async (entry) => {
			return writeSummaryTreeObject(entry, options);
		}),
	);

	const createdTree = await options.repoManager.createTree({ tree: createTreeEntries });
	if (options.precomputeFullTree && options.currentPath === "") {
		return precomputeFullGitTree(createdTree, options);
	}
	return {
		tree: createdTree,
		blobs: options.blobCache,
		parsedFullTreeBlobs: false,
	};
}

async function computeInMemoryFullGitTree(
	wholeSummaryTreeEntries: WholeSummaryTreeEntry[],
	documentRef: IRef | undefined,
	inMemoryRepoManager: IRepositoryManager,
	writeSummaryTreeOptions: IWriteSummaryTreeOptions,
	options: IWholeSummaryOptions,
): Promise<IFullGitTree> {
	const inMemoryWriteSummaryTreeOptions: IWriteSummaryTreeOptions = {
		repoManager: inMemoryRepoManager,
		enableLowIoWrite: writeSummaryTreeOptions.enableLowIoWrite,
		precomputeFullTree: writeSummaryTreeOptions.precomputeFullTree,
		currentPath: writeSummaryTreeOptions.currentPath,
		// Use blank caches caches for in-memory repo manager. Otherwise, we will be referencing
		// blobs in storage that are not in-memory.
		entryHandleToObjectShaCache: new Map<string, string>(),
		blobCache: {},
		treeCache: {},
	};
	if (documentRef) {
		// Update in-memory repo manager with previous summary for handle references.
		const previousSummary = await readSummary(documentRef.object.sha, options);
		const fullSummaryPayload = convertFullSummaryToWholeSummaryEntries({
			treeEntries: previousSummary.trees[0].entries,
			blobs: previousSummary.blobs ?? [],
		});
		const previousSummaryMemoryFullGitTree = await writeSummaryTreeCore(
			fullSummaryPayload,
			inMemoryWriteSummaryTreeOptions,
		);
		for (const treeEntry of previousSummaryMemoryFullGitTree.tree.tree) {
			// Update entry handle to object sha map for reference when writing summary handles.
			writeSummaryTreeOptions.entryHandleToObjectShaCache.set(
				`${documentRef.object.sha}/${treeEntry.path}`,
				treeEntry.sha,
			);
		}
	}

	const writeSummaryIntoMemory = async () =>
		writeSummaryTreeCore(wholeSummaryTreeEntries, inMemoryWriteSummaryTreeOptions);

	const inMemorySummaryFullGitTree = await writeSummaryIntoMemory().catch(async (error) => {
		if (
			error?.caller === "git.walk" &&
			error.code === "NotFoundError" &&
			typeof error.data?.what === "string"
		) {
			// This is caused by the previous channel summary tree being missing.
			// Fetch the missing tree, write it into the in-memory storage, then retry.
			const missingTreeSha = error.data.what;
			const missingTree = await options.repoManager.getTree(
				missingTreeSha,
				true /* recursive */,
			);
			const fullTree = await buildFullGitTreeFromGitTree(
				missingTree,
				writeSummaryTreeOptions.repoManager,
				writeSummaryTreeOptions.blobCache /* blobCache */,
				false /* parseInnerFullGitTrees */,
				true /* retrieveBlobs */,
			);
			const writtenTreeHandle = await writeFullGitTreeAsSummaryTree(
				fullTree,
				inMemoryWriteSummaryTreeOptions,
			);
			if (writtenTreeHandle !== missingTreeSha) {
				Lumberjack.error(
					`Attempted to recover from missing git object (${missingTreeSha}), but recovered data sha (${writtenTreeHandle}) did not match.`,
					{ ...options.lumberjackProperties },
				);
				throw new NetworkError(
					500,
					"Failed to compute new container summary.",
					false /* canRetry */,
				);
			}
			return writeSummaryIntoMemory();
		} else {
			throw error;
		}
	});
	return inMemorySummaryFullGitTree;
}

async function computeLowIoSummaryTreeEntries(
	payload: IWholeSummaryPayload,
	documentRef: IRef | undefined,
	writeSummaryTreeOptions: IWriteSummaryTreeOptions,
	options: IWholeSummaryOptions,
): Promise<WholeSummaryTreeEntry[]> {
	const inMemoryFsManagerFactory = new MemFsManagerFactory();
	const inMemoryRepoManagerFactory = new IsomorphicGitManagerFactory(
		{
			baseDir: "/usr/gitrest",
			useRepoOwner: true,
		},
		{
			defaultFileSystemManagerFactory: inMemoryFsManagerFactory,
		},
		new NullExternalStorageManager(),
		true /* repoPerDocEnabled */,
		false /* enableRepositoryManagerMetrics */,
	);
	const inMemoryRepoManager = await inMemoryRepoManagerFactory.create({
		repoOwner: "gitrest",
		repoName: options.documentId,
		storageRoutingId: {
			tenantId: "internal",
			documentId: options.documentId,
		},
	});
	try {
		const fullGitTree = await computeInMemoryFullGitTree(
			payload.entries,
			documentRef,
			inMemoryRepoManager,
			writeSummaryTreeOptions,
			options,
		);
		return [
			{
				path: Constants.FullTreeBlobPath,
				type: "blob",
				value: {
					type: "blob",
					content: JSON.stringify(fullGitTree),
					encoding: "utf-8",
				},
			},
		];
	} finally {
		// Ensure temporary in-memory volume is destroyed.
		inMemoryFsManagerFactory.volume.reset();
	}
}

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
	options: IWholeSummaryOptions & ISummaryWriteOptions,
): Promise<IWriteSummaryInfo> {
	const useLowIoWrite = options.enableLowIoWrite === true;
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
 * Persist the given summary payload as a new git tree. The payload will be referenced by a new
 * commit which will be referenced by the document's ref.
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

export async function writeContainerSummary(
	payload: IWholeSummaryPayload,
	isInitial: boolean,
	options: IWholeSummaryOptions & ISummaryWriteOptions,
): Promise<IWriteSummaryInfo> {
	// Ref will not exist for an initial summary, so do not bother checking.
	const documentRef: IRef | undefined =
		options.optimizeForInitialSummary && isInitial === true
			? undefined
			: await getDocRef(options);
	const isNewDocument = !documentRef && payload.sequenceNumber === 0;
	const useLowIoWrite =
		options.enableLowIoWrite === true ||
		(isNewDocument && options.enableLowIoWrite === "initial");
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
