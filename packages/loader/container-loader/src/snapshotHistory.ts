/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IDisposable } from "@fluidframework/core-interfaces";
import { type ISummaryTree, SummaryType } from "@fluidframework/driver-definitions";
import type {
	IDocumentStorageService,
	IDocumentStorageServicePolicies,
	ISnapshot,
	ISnapshotTree,
	ISummaryContext,
} from "@fluidframework/driver-definitions/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

/**
 * Configuration options for the snapshot history feature.
 * @internal
 */
export interface ISnapshotHistoryOptions {
	/** Feature gate (default: false) */
	enabled: boolean;
	/** Drop checkpoints older than this (ms), e.g., 24h = 86400000 */
	maxAge: number;
	/** Min time between checkpoints (ms), e.g., 30 min = 1800000 */
	minTimeBetweenCheckpoints: number;
	/** Min ops between checkpoints, e.g., 1000 */
	minOpsBetweenCheckpoints: number;
}

/**
 * Metadata for a single history checkpoint.
 * @alpha
 */
export interface IHistoryCheckpointInfo {
	/** Sequence number at time of checkpoint */
	seqNum: number;
	/** Timestamp (ms since epoch) when checkpoint was created */
	timestamp: number;
	/** Loading group ID for delay-loading this checkpoint */
	groupId: string;
	/** If true, checkpoint is exempt from age-based retention. Not yet used; future-proofs the format. */
	pinned?: boolean;
}

/**
 * Data returned from loading a historical checkpoint snapshot.
 * @alpha
 */
export interface IHistoryCheckpointData {
	/** Sequence number at time of checkpoint */
	seqNum: number;
	/** The checkpoint subtree (has .app and .protocol children) */
	snapshotTree: ISnapshotTree;
	/** Blob data for the checkpoint's loading group */
	blobContents: Map<string, ArrayBuffer>;
}

/**
 * Versioned index blob format stored in .history/index.
 */
interface IHistoryIndex {
	version: 1;
	checkpoints: IHistoryCheckpointInfo[];
}

const historyTreeName = ".history";
const indexBlobName = "index";
const checkpointPrefix = "cp-";
const historyGroupIdPrefix = "fluid-history-";

/**
 * Creates a group ID for a checkpoint at the given sequence number.
 */
function checkpointGroupId(seqNum: number): `fluid-history-${number}` {
	return `${historyGroupIdPrefix}${seqNum}`;
}

/**
 * Creates the checkpoint subtree key name.
 */
function checkpointKey(seqNum: number): `cp-${number}` {
	return `${checkpointPrefix}${seqNum}`;
}

/**
 * Finds the checkpoint with the highest sequence number in the given array.
 * The array must be non-empty.
 */
function findLatestCheckpoint(checkpoints: IHistoryCheckpointInfo[]): IHistoryCheckpointInfo {
	let latest = checkpoints[0];
	for (let i = 1; i < checkpoints.length; i++) {
		if (checkpoints[i].seqNum > latest.seqNum) {
			latest = checkpoints[i];
		}
	}
	return latest;
}

/**
 * A storage service wrapper that intercepts uploadSummaryWithContext to add a `.history` subtree
 * containing checkpoint handles and an index blob.
 *
 * Follows the same pattern as ProtocolTreeStorageService.
 * @internal
 */
export class HistoryTreeStorageService implements IDocumentStorageService, IDisposable {
	private checkpoints: IHistoryCheckpointInfo[];
	private lastCheckpointTime: number;
	private lastCheckpointSeqNum: number;

	constructor(
		private readonly internalStorageService: IDocumentStorageService & IDisposable,
		private readonly options: ISnapshotHistoryOptions,
		private readonly getSequenceNumber: () => number,
		initialCheckpoints: IHistoryCheckpointInfo[],
	) {
		this.getSnapshotTree = internalStorageService.getSnapshotTree.bind(internalStorageService);
		this.getSnapshot = internalStorageService.getSnapshot?.bind(internalStorageService);
		this.getVersions = internalStorageService.getVersions.bind(internalStorageService);
		this.createBlob = internalStorageService.createBlob.bind(internalStorageService);
		this.readBlob = internalStorageService.readBlob.bind(internalStorageService);
		this.downloadSummary = internalStorageService.downloadSummary.bind(internalStorageService);
		this.dispose = internalStorageService.dispose.bind(internalStorageService);

		this.checkpoints = [...initialCheckpoints];
		// Initialize from the most recent checkpoint if available
		if (this.checkpoints.length > 0) {
			const latest = findLatestCheckpoint(this.checkpoints);
			this.lastCheckpointTime = latest.timestamp;
			this.lastCheckpointSeqNum = latest.seqNum;
		} else {
			this.lastCheckpointTime = 0;
			this.lastCheckpointSeqNum = 0;
		}
	}

	public get policies(): IDocumentStorageServicePolicies | undefined {
		return this.internalStorageService.policies;
	}

	public get disposed(): boolean {
		return this.internalStorageService.disposed;
	}

	getSnapshotTree: IDocumentStorageService["getSnapshotTree"];
	getSnapshot: IDocumentStorageService["getSnapshot"];
	getVersions: IDocumentStorageService["getVersions"];
	createBlob: IDocumentStorageService["createBlob"];
	readBlob: IDocumentStorageService["readBlob"];
	downloadSummary: IDocumentStorageService["downloadSummary"];
	dispose: IDisposable["dispose"];

	/**
	 * Initializes the checkpoint list from the loaded snapshot's history index.
	 * Called after the snapshot is loaded but before the first summary upload.
	 */
	public initializeCheckpoints(checkpoints: IHistoryCheckpointInfo[]): void {
		this.checkpoints = [...checkpoints];
		if (this.checkpoints.length > 0) {
			const latest = findLatestCheckpoint(this.checkpoints);
			this.lastCheckpointTime = latest.timestamp;
			this.lastCheckpointSeqNum = latest.seqNum;
		}
	}

	/**
	 * Returns the current list of checkpoints (for read-side access).
	 */
	public getCheckpoints(): IHistoryCheckpointInfo[] {
		return [...this.checkpoints];
	}

	async uploadSummaryWithContext(
		summary: ISummaryTree,
		context: ISummaryContext,
	): Promise<string> {
		if (!this.options.enabled) {
			return this.internalStorageService.uploadSummaryWithContext(summary, context);
		}

		const now = Date.now();
		const currentSeqNum = this.getSequenceNumber();

		// 1. Evaluate checkpoint creation heuristic
		const shouldCreateCheckpoint = this.shouldCreateCheckpoint(now, currentSeqNum);

		// 2. Enforce retention: drop old, non-pinned checkpoints
		const retainedCheckpoints = this.checkpoints.filter(
			(cp) => cp.pinned === true || now - cp.timestamp <= this.options.maxAge,
		);

		// 3. Build the .history subtree
		const historyTree: ISummaryTree["tree"] = {};

		// Carry forward retained checkpoints as handles
		for (const cp of retainedCheckpoints) {
			historyTree[checkpointKey(cp.seqNum)] = {
				type: SummaryType.Handle,
				handleType: SummaryType.Tree,
				handle: `${historyTreeName}/${checkpointKey(cp.seqNum)}`,
			};
		}

		// Create new checkpoint if needed
		if (shouldCreateCheckpoint) {
			const seqNum = currentSeqNum;
			const groupId = checkpointGroupId(seqNum);
			historyTree[checkpointKey(seqNum)] = {
				type: SummaryType.Tree,
				tree: {
					".app": {
						type: SummaryType.Handle,
						handleType: SummaryType.Tree,
						handle: ".app",
					},
					".protocol": {
						type: SummaryType.Handle,
						handleType: SummaryType.Tree,
						handle: ".protocol",
					},
				},
				groupId,
			};

			const newCheckpoint: IHistoryCheckpointInfo = {
				seqNum,
				timestamp: now,
				groupId,
			};
			retainedCheckpoints.push(newCheckpoint);
			this.lastCheckpointTime = now;
			this.lastCheckpointSeqNum = seqNum;
		}

		// Update the internal checkpoint list
		this.checkpoints = retainedCheckpoints;

		// Build the index blob
		const indexContent: IHistoryIndex = {
			version: 1,
			checkpoints: retainedCheckpoints.map((cp) => {
				const entry: IHistoryCheckpointInfo = {
					seqNum: cp.seqNum,
					timestamp: cp.timestamp,
					groupId: cp.groupId,
				};
				if (cp.pinned === true) {
					entry.pinned = true;
				}
				return entry;
			}),
		};

		historyTree[indexBlobName] = {
			type: SummaryType.Blob,
			content: JSON.stringify(indexContent),
		};

		// Add the .history tree to the summary
		const augmentedSummary: ISummaryTree = {
			type: SummaryType.Tree,
			tree: {
				...summary.tree,
				[historyTreeName]: {
					type: SummaryType.Tree,
					tree: historyTree,
				},
			},
		};

		return this.internalStorageService.uploadSummaryWithContext(augmentedSummary, context);
	}

	private shouldCreateCheckpoint(now: number, currentSeqNum: number): boolean {
		// Always create on first summary when no checkpoints exist
		if (this.checkpoints.length === 0 && this.lastCheckpointTime === 0) {
			return true;
		}

		const timeSinceLastCheckpoint = now - this.lastCheckpointTime;
		const opsSinceLastCheckpoint = currentSeqNum - this.lastCheckpointSeqNum;

		return (
			timeSinceLastCheckpoint >= this.options.minTimeBetweenCheckpoints ||
			opsSinceLastCheckpoint >= this.options.minOpsBetweenCheckpoints
		);
	}
}

/**
 * Parses the history index from a loaded snapshot tree.
 * Returns an empty array if no history is present.
 *
 * @param snapshotTree - The snapshot tree to parse
 * @param readBlob - Function to read blob content by ID
 * @returns The list of checkpoint info entries
 * @internal
 */
export async function parseHistoryIndex(
	snapshotTree: { trees?: Record<string, { blobs?: Record<string, string> }> } | undefined,
	readBlob: (id: string) => Promise<ArrayBufferLike>,
): Promise<IHistoryCheckpointInfo[]> {
	if (snapshotTree?.trees === undefined) {
		return [];
	}

	const historyTree = snapshotTree.trees[historyTreeName];
	if (historyTree?.blobs === undefined) {
		return [];
	}

	const indexBlobId = historyTree.blobs[indexBlobName];
	if (indexBlobId === undefined) {
		return [];
	}

	const blobContent = await readBlob(indexBlobId);
	const text =
		typeof blobContent === "string"
			? blobContent
			: new TextDecoder().decode(blobContent as ArrayBuffer);
	const index = JSON.parse(text) as IHistoryIndex;

	if (index.version !== 1) {
		// Unknown version - return empty to avoid breaking
		return [];
	}

	return index.checkpoints;
}

/**
 * Read-side API for accessing snapshot history checkpoints.
 * @alpha @sealed
 */
export class SnapshotHistoryManager {
	constructor(
		private readonly storageService: {
			getCheckpoints(): IHistoryCheckpointInfo[];
			getSnapshot: IDocumentStorageService["getSnapshot"];
		},
	) {}

	/**
	 * Returns all available checkpoint metadata (sync, no network call).
	 * The index is always loaded with the main snapshot.
	 */
	public getCheckpoints(): IHistoryCheckpointInfo[] {
		return this.storageService.getCheckpoints();
	}

	/**
	 * Finds a checkpoint by sequence number.
	 * @param seqNum - The sequence number to look up
	 * @returns The checkpoint info, or undefined if not found
	 */
	public getCheckpoint(seqNum: number): IHistoryCheckpointInfo | undefined {
		return this.storageService.getCheckpoints().find((cp) => cp.seqNum === seqNum);
	}

	/**
	 * Finds the closest checkpoint at or before the given sequence number.
	 * @param seqNum - The target sequence number
	 * @returns The closest checkpoint info, or undefined if none found
	 */
	public getClosestCheckpoint(seqNum: number): IHistoryCheckpointInfo | undefined {
		const candidates = this.storageService
			.getCheckpoints()
			.filter((cp) => cp.seqNum <= seqNum);
		if (candidates.length === 0) {
			return undefined;
		}
		return findLatestCheckpoint(candidates);
	}

	/**
	 * Loads the snapshot data for a historical checkpoint via the driver's getSnapshot API.
	 * @param checkpoint - The checkpoint to load (from getCheckpoints / getCheckpoint / getClosestCheckpoint)
	 * @returns The checkpoint's snapshot tree and blob contents
	 */
	public async loadCheckpoint(
		checkpoint: IHistoryCheckpointInfo,
	): Promise<IHistoryCheckpointData> {
		const getSnapshot = this.storageService.getSnapshot;
		if (getSnapshot === undefined) {
			throw new UsageError("loadCheckpoint requires a driver that supports getSnapshot");
		}

		const snapshot: ISnapshot = await getSnapshot({
			loadingGroupIds: [checkpoint.groupId],
		});

		const cpKey = checkpointKey(checkpoint.seqNum);
		const historyTree = snapshot.snapshotTree.trees[historyTreeName];
		if (historyTree === undefined) {
			throw new UsageError(
				`Snapshot for loading group "${checkpoint.groupId}" does not contain a .history tree`,
			);
		}

		const cpTree = historyTree.trees[cpKey];
		if (cpTree === undefined) {
			throw new UsageError(
				`Snapshot for loading group "${checkpoint.groupId}" does not contain checkpoint "${cpKey}"`,
			);
		}

		return {
			seqNum: checkpoint.seqNum,
			snapshotTree: cpTree,
			blobContents: snapshot.blobContents,
		};
	}
}
