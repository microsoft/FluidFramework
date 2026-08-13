/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IsoBuffer,
	Uint8ArrayToString,
	bufferToString,
	fromBase64ToUtf8,
} from "@fluid-internal/client-utils";
import type { ISnapshotTreeWithBlobContents } from "@fluidframework/container-definitions/internal";
import { assert, unreachableCase } from "@fluidframework/core-utils/internal";
import type {
	ISummaryBlob,
	ISummaryTree,
	SummaryObject,
} from "@fluidframework/driver-definitions";
import { SummaryType } from "@fluidframework/driver-definitions";
import type { ITree, ITreeEntry } from "@fluidframework/driver-definitions/internal";
import { TreeEntry } from "@fluidframework/driver-definitions/internal";
import {
	AttachmentTreeEntry,
	BlobTreeEntry,
	TreeTreeEntry,
} from "@fluidframework/driver-utils/internal";
import type {
	ISummaryStats,
	ISummaryTreeWithStats,
	ITelemetryContext,
	IGarbageCollectionData,
	ISummarizeResult,
	ISummaryBuilder,
	ITelemetryContextExt,
} from "@fluidframework/runtime-definitions/internal";
import {
	currentSummarizeStepPrefix,
	currentSummarizeStepPropertyName,
	gcDataBlobKey,
} from "@fluidframework/runtime-definitions/internal";
import type { TelemetryEventPropertyTypeExt } from "@fluidframework/telemetry-utils/internal";

/**
 * Combines summary stats by adding their totals together.
 * Returns empty stats if called without args.
 * @param stats - stats to merge
 * @internal
 */
export function mergeStats(...stats: ISummaryStats[]): ISummaryStats {
	const results = {
		treeNodeCount: 0,
		blobNodeCount: 0,
		handleNodeCount: 0,
		totalBlobSize: 0,
		unreferencedBlobSize: 0,
	};
	for (const stat of stats) {
		results.treeNodeCount += stat.treeNodeCount;
		results.blobNodeCount += stat.blobNodeCount;
		results.handleNodeCount += stat.handleNodeCount;
		results.totalBlobSize += stat.totalBlobSize;
		results.unreferencedBlobSize += stat.unreferencedBlobSize;
	}
	return results;
}

/**
 * Calculates the byte length of an UTF-8 encoded string
 * @param str - The string to calculate the byte length of
 * @returns The byte length of the string
 * @internal
 */
export function utf8ByteLength(str: string): number {
	// returns the byte length of an utf8 string
	let s = str.length;
	for (let i = str.length - 1; i >= 0; i--) {
		const code = str.codePointAt(i);
		if (code !== undefined) {
			if (code > 0x7f && code <= 0x7ff) {
				s++;
			} else if (code > 0x7ff && code <= 0xffff) {
				s += 2;
			}
			if (code >= 0xdc00 && code <= 0xdfff) {
				i--; // trail surrogate
			}
		}
	}
	return s;
}

/**
 * Gets the size of a blob
 * @param content - The content of the blob
 * @returns The size of the blob in bytes
 * @internal
 */
export function getBlobSize(content: ISummaryBlob["content"]): number {
	return typeof content === "string" ? utf8ByteLength(content) : content.byteLength;
}

function calculateStatsCore(summaryObject: SummaryObject, stats: ISummaryStats): void {
	switch (summaryObject.type) {
		case SummaryType.Tree: {
			stats.treeNodeCount++;
			for (const value of Object.values(summaryObject.tree)) {
				calculateStatsCore(value, stats);
			}
			return;
		}
		case SummaryType.Handle: {
			stats.handleNodeCount++;
			return;
		}
		case SummaryType.Blob: {
			stats.blobNodeCount++;
			stats.totalBlobSize += getBlobSize(summaryObject.content);
			return;
		}
		default: {
			return;
		}
	}
}

/**
 * Calculates the stats for a summary object
 * @param summary - The summary object to calculate stats for
 * @returns The calculated stats
 * @internal
 */
export function calculateStats(summary: SummaryObject): ISummaryStats {
	const stats = mergeStats();
	calculateStatsCore(summary, stats);
	return stats;
}

/**
 * Adds a blob to the summary tree
 * @param summary - The summary tree to add the blob to
 * @param key - The key to store the blob at
 * @param content - The content of the blob to be added
 * @internal
 */
export function addBlobToSummary(
	summary: ISummaryTreeWithStats,
	key: string,
	content: string | Uint8Array,
): void {
	const blob: ISummaryBlob = {
		type: SummaryType.Blob,
		content,
	};
	summary.summary.tree[key] = blob;
	summary.stats.blobNodeCount++;
	summary.stats.totalBlobSize += getBlobSize(content);
}

/**
 * Adds a summarize result to the summary tree
 * @param summary - The summary tree to add the summarize result to
 * @param key - The key to store the summarize result at
 * @param summarizeResult - The summarize result to be added
 * @internal
 */
export function addSummarizeResultToSummary(
	summary: ISummaryTreeWithStats,
	key: string,
	summarizeResult: ISummarizeResult,
): void {
	summary.summary.tree[key] = summarizeResult.summary;
	summary.stats = mergeStats(summary.stats, summarizeResult.stats);
}

/**
 * An object who's properties are used to initialize a {@link SummaryTreeBuilder}
 * @legacy @beta
 */
export interface SummaryTreeBuilderParams {
	/**
	 * This value will become the {@link @fluidframework/driver-definitions#ISummaryTree.groupId}
	 * of the {@link @fluidframework/driver-definitions#ISummaryTree} built by the {@link SummaryTreeBuilder}.
	 */
	groupId?: string;
}
/**
 * A helper class for building summary trees.
 * @remarks Uses the builder pattern.
 * @legacy @beta
 */
export class SummaryTreeBuilder implements ISummaryTreeWithStats {
	private attachmentCounter: number = 0;
	private readonly groupId?: string;

	public get summary(): ISummaryTree {
		const summary: ISummaryTree = {
			type: SummaryType.Tree,
			tree: { ...this.summaryTree },
		};
		if (this.groupId !== undefined) {
			summary.groupId = this.groupId;
		}
		return summary;
	}

	public get stats(): Readonly<ISummaryStats> {
		return { ...this.summaryStats };
	}

	public constructor(params?: { groupId?: string }) {
		this.summaryStats = mergeStats();
		this.summaryStats.treeNodeCount++;
		this.groupId = params?.groupId;
	}

	private readonly summaryTree: Record<string, SummaryObject> = {};
	private summaryStats: ISummaryStats;

	/**
	 * Add a blob to the summary tree. This blob will be stored at the given key in the summary tree.
	 * @param key - The key to store the blob at in the current summary tree being generated. Should not contain any "/" characters.
	 * @param content - The content of the blob to be added to the summary tree.
	 */
	public addBlob(key: string, content: string | Uint8Array): void {
		// Prevent cloning by directly referencing underlying private properties
		addBlobToSummary(
			{
				summary: {
					type: SummaryType.Tree,
					tree: this.summaryTree,
				},
				stats: this.summaryStats,
			},
			key,
			content,
		);
	}

	/**
	 * Adds an {@link @fluidframework/driver-definitions#ISummaryHandle} that references a subtree, blob, or attachment in a previous summary.
	 *
	 * @param key - The key to store the handle at in the current summary tree being generated. Should not contain any "/" characters.
	 * @param handleType - the type of {@link @fluidframework/driver-definitions#SummaryObject} besides a SummaryHandle, i.e. {@link @fluidframework/driver-definitions#SummaryType.Tree}, {@link @fluidframework/driver-definitions#SummaryType.Blob}, {@link @fluidframework/driver-definitions#SummaryType.Attachment}
	 * @param handle - The path pointing to the part of the previous summary being used to duplicate the data. Use {@link @fluidframework/driver-definitions#ISummaryHandle.handle} to help generate proper handle strings. Should not contain any "/" characters.
	 */
	public addHandle(
		key: string,
		handleType: SummaryType.Tree | SummaryType.Blob | SummaryType.Attachment,
		handle: string,
	): void {
		this.summaryTree[key] = {
			type: SummaryType.Handle,
			handleType,
			handle,
		};
		this.summaryStats.handleNodeCount++;
	}

	/**
	 * Adds a child and updates the stats accordingly.
	 * @param key - The key to store the handle at in the current summary tree being generated. Should not contain any "/" characters.
	 * The key should be unique within the current summary tree, and not transform when encodeURIComponent is called.
	 * @param summarizeResult - Similar to {@link @fluidframework/runtime-definitions#ISummaryTreeWithStats}. The provided summary can be either a {@link @fluidframework/driver-definitions#ISummaryHandle} or {@link @fluidframework/driver-definitions#ISummaryTree}.
	 */
	public addWithStats(key: string, summarizeResult: ISummarizeResult): void {
		this.summaryTree[key] = summarizeResult.summary;
		this.summaryStats = mergeStats(this.summaryStats, summarizeResult.stats);
	}

	/**
	 * Adds an {@link @fluidframework/driver-definitions#ISummaryAttachment} to the summary. This blob needs to already be uploaded to storage.
	 * @param id - The id of the uploaded attachment to be added to the summary tree.
	 */
	public addAttachment(id: string): void {
		this.summaryTree[this.attachmentCounter++] = { id, type: SummaryType.Attachment };
	}

	/**
	 * Gives you the in-memory summary tree with stats built by the SummaryTreeBuilder.
	 *
	 * @remarks
	 * Use this once you're done building the summary tree, the stats should automatically be generated.
	 * @returns The summary tree and stats built by the SummaryTreeBuilder.
	 */
	public getSummaryTree(): ISummaryTreeWithStats {
		return { summary: this.summary, stats: this.stats };
	}
}

/**
 * Converts snapshot ITree to ISummaryTree format and tracks stats.
 * @param snapshot - snapshot in ITree format
 * @param fullTree - true to never use handles, even if id is specified
 * @legacy @beta
 */
export function convertToSummaryTreeWithStats(
	snapshot: ITree,
	fullTree: boolean = false,
): ISummaryTreeWithStats {
	const builder = new SummaryTreeBuilder();
	for (const entry of snapshot.entries) {
		switch (entry.type) {
			case TreeEntry.Blob: {
				const blob = entry.value;
				const content =
					blob.encoding === "base64" ? IsoBuffer.from(blob.contents, "base64") : blob.contents;
				builder.addBlob(entry.path, content);
				break;
			}

			case TreeEntry.Tree: {
				const subtree = convertToSummaryTree(entry.value, fullTree);
				builder.addWithStats(entry.path, subtree);

				break;
			}

			case TreeEntry.Attachment: {
				const id = entry.value.id;
				builder.addAttachment(id);

				break;
			}

			default: {
				throw new Error("Unexpected TreeEntry type");
			}
		}
	}

	const summaryTree = builder.getSummaryTree();
	summaryTree.summary.unreferenced = snapshot.unreferenced;
	summaryTree.summary.groupId = snapshot.groupId;
	return summaryTree;
}

/**
 * Converts snapshot ITree to ISummaryTree format and tracks stats.
 * @param snapshot - snapshot in ITree format
 * @param fullTree - true to never use handles, even if id is specified
 * @internal
 */
export function convertToSummaryTree(
	snapshot: ITree,
	fullTree: boolean = false,
): ISummarizeResult {
	// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
	if (snapshot.id && !fullTree) {
		const stats = mergeStats();
		stats.handleNodeCount++;
		return {
			summary: {
				handle: snapshot.id,
				handleType: SummaryType.Tree,
				type: SummaryType.Handle,
			},
			stats,
		};
	} else {
		return convertToSummaryTreeWithStats(snapshot, fullTree);
	}
}

/**
 * Converts ISnapshotTree to ISummaryTree format and tracks stats. This snapshot tree was
 * was taken by serialize api in detached container.
 * @param snapshot - snapshot in ISnapshotTree format
 * @internal
 */
export function convertSnapshotTreeToSummaryTree(
	snapshot: ISnapshotTreeWithBlobContents,
): ISummaryTreeWithStats {
	const builder = new SummaryTreeBuilder();
	for (const [path, id] of Object.entries(snapshot.blobs)) {
		let decoded: string | undefined;
		if (snapshot.blobsContents !== undefined) {
			// TODO Why are we non null asserting here?
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const content: ArrayBufferLike = snapshot.blobsContents[id]!;
			if (content !== undefined) {
				// Cannot change "utf-8" to "utf8" as this encoding value is stored in summaries and would be a breaking change which needs to be done first before changing to utf8.
				// eslint-disable-next-line unicorn/text-encoding-identifier-case -- External on-disk format is 'utf-8'.
				decoded = bufferToString(content, "utf-8");
			}
			// 0.44 back-compat We still put contents in same blob for back-compat so need to add blob
			// only for blobPath -> blobId mapping and not for blobId -> blob value contents.
		} else if (snapshot.blobs[id] !== undefined) {
			// Non null asserting here because of the undefined check above
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			decoded = fromBase64ToUtf8(snapshot.blobs[id]!);
		}
		if (decoded !== undefined) {
			builder.addBlob(path, decoded);
		}
	}

	for (const [key, tree] of Object.entries(snapshot.trees)) {
		const subtree = convertSnapshotTreeToSummaryTree(tree);
		builder.addWithStats(key, subtree);
	}

	const summaryTree = builder.getSummaryTree();
	summaryTree.summary.unreferenced = snapshot.unreferenced;
	summaryTree.summary.groupId = snapshot.groupId;
	return summaryTree;
}

/**
 * Converts ISummaryTree to ITree format. This is needed for back-compat while we get rid of snapshot.
 * @param summaryTree - summary tree in ISummaryTree format
 * @internal
 */
export function convertSummaryTreeToITree(summaryTree: ISummaryTree): ITree {
	const entries: ITreeEntry[] = [];
	for (const [key, value] of Object.entries(summaryTree.tree)) {
		switch (value.type) {
			case SummaryType.Blob: {
				let parsedContent: string;
				// Cannot change "utf-8" to "utf8" as this encoding value is stored in summaries and would be a breaking change which needs to be done first before changing to utf8.
				// eslint-disable-next-line unicorn/text-encoding-identifier-case -- external contract uses 'utf-8'.
				let encoding: "utf-8" | "base64" = "utf-8";
				if (typeof value.content === "string") {
					parsedContent = value.content;
				} else {
					parsedContent = Uint8ArrayToString(value.content, "base64");
					encoding = "base64";
				}
				entries.push(new BlobTreeEntry(key, parsedContent, encoding));
				break;
			}

			case SummaryType.Tree: {
				entries.push(new TreeTreeEntry(key, convertSummaryTreeToITree(value)));
				break;
			}

			case SummaryType.Attachment: {
				entries.push(new AttachmentTreeEntry(key, value.id));
				break;
			}

			case SummaryType.Handle: {
				throw new Error("Should not have Handle type in summary tree");
			}

			default: {
				unreachableCase(value, "Unexpected summary tree type");
			}
		}
	}
	return {
		entries,
		unreferenced: summaryTree.unreferenced,
		groupId: summaryTree.groupId,
	};
}

/**
 * Looks in the given attach message snapshot for the .gcdata blob, which would
 * contain the initial GC Data for the node being attached.
 * If it finds it, it notifies GC of all the new outbound routes being added by the attach.
 *
 * @param snapshot - The snapshot from the attach message
 * @param addedGCOutboundRoute - Callback to notify GC of a new outbound route.
 * IMPORTANT: addedGCOutboundRoute's param nodeId is "/" for the attaching node itself, or "/<id>" for its children.
 *
 * @returns true if it found/processed GC Data, false otherwise
 *
 * @internal
 */
export function processAttachMessageGCData(
	snapshot: ITree | undefined,
	addedGCOutboundRoute: (fromNodeId: string, toPath: string) => void,
): boolean {
	const gcDataEntry = snapshot?.entries.find((e) => e.path === gcDataBlobKey);

	// Old attach messages won't have GC Data
	// (And REALLY old DataStore Attach messages won't even have a snapshot!)
	if (gcDataEntry === undefined) {
		return false;
	}

	assert(
		// Cannot change "utf-8" to "utf8" as this encoding value is stored in summaries and would be a breaking change which needs to be done first before changing to utf8.
		// eslint-disable-next-line unicorn/text-encoding-identifier-case  -- external contract uses 'utf-8'.
		gcDataEntry.type === TreeEntry.Blob && gcDataEntry.value.encoding === "utf-8",
		0x8ff /* GC data should be a utf-8-encoded blob */,
	);

	// Type assertion is safe as we expect the GC data to conform to IGarbageCollectionData schema
	const gcData = JSON.parse(gcDataEntry.value.contents) as IGarbageCollectionData;
	for (const [nodeId, outboundRoutes] of Object.entries(gcData.gcNodes)) {
		for (const toPath of outboundRoutes) {
			addedGCOutboundRoute(nodeId, toPath);
		}
	}
	return true;
}

/**
 * @internal
 */
export class TelemetryContext implements ITelemetryContext, ITelemetryContextExt {
	private readonly telemetry = new Map<string, TelemetryEventPropertyTypeExt>();

	/**
	 * {@inheritDoc @fluidframework/runtime-definitions#ITelemetryContext.set}
	 */
	public set(prefix: string, property: string, value: TelemetryEventPropertyTypeExt): void {
		this.telemetry.set(`${prefix}${property}`, value);
	}

	/**
	 * {@inheritDoc @fluidframework/runtime-definitions#ITelemetryContext.setMultiple}
	 */
	public setMultiple(
		prefix: string,
		property: string,
		values: Record<string, TelemetryEventPropertyTypeExt>,
	): void {
		// Set the values individually so that they are logged as a flat list along with other properties.
		for (const key of Object.keys(values)) {
			this.set(prefix, `${property}_${key}`, values[key]);
		}
	}

	/**
	 * Get the telemetry data being tracked
	 * @param prefix - unique prefix to tag this data with (ex: "fluid:map:")
	 * @param property - property name of the telemetry data being tracked (ex: "DirectoryCount")
	 * @returns undefined if item not found
	 */
	public get(prefix: string, property: string): TelemetryEventPropertyTypeExt {
		return this.telemetry.get(`${prefix}${property}`);
	}

	/**
	 * Returns a serialized version of all the telemetry data.
	 * Should be used when logging in telemetry events.
	 */
	public serialize(): string {
		const jsonObject = {};
		for (const [key, value] of this.telemetry.entries()) {
			jsonObject[key] = value;
		}
		return JSON.stringify(jsonObject);
	}

	public getCurrentSummarizeStep(): TelemetryEventPropertyTypeExt {
		return this.get(currentSummarizeStepPrefix, currentSummarizeStepPropertyName);
	}

	public setCurrentSummarizeStep(value: TelemetryEventPropertyTypeExt): void {
		this.set(currentSummarizeStepPrefix, currentSummarizeStepPropertyName, value);
	}
}

/**
 * Trims the leading slashes from the given string.
 * @param str - A string that may contain leading slashes.
 * @returns A new string without leading slashes.
 */
function trimLeadingSlashes(str: string): string {
	return str.replace(/^\/+/g, "");
}

/**
 * Trims the trailing slashes from the given string.
 * @param str - A string that may contain trailing slashes.
 * @returns A new string without trailing slashes.
 */
function trimTrailingSlashes(str: string): string {
	return str.replace(/\/+$/g, "");
}

/**
 * Helper class to build the garbage collection data of a node by combining the data from multiple nodes.
 * @internal
 */
export class GCDataBuilder implements IGarbageCollectionData {
	private readonly gcNodesSet: Record<string, Set<string>> = {};
	public get gcNodes(): Record<string, string[]> {
		const gcNodes = {};
		for (const [nodeId, outboundRoutes] of Object.entries(this.gcNodesSet)) {
			gcNodes[nodeId] = [...outboundRoutes];
		}
		return gcNodes;
	}

	public addNode(id: string, outboundRoutes: string[]): void {
		this.gcNodesSet[id] = new Set(outboundRoutes);
	}

	/**
	 * Adds the given GC nodes. It does the following:
	 * - Normalizes the ids of the given nodes.
	 * - Prefixes the given `prefixId` to the given nodes' ids.
	 * - Adds the outbound routes of the nodes against the normalized and prefixed id.
	 */
	public prefixAndAddNodes(prefixId: string, gcNodes: Record<string, string[]>): void {
		for (const [id, outboundRoutes] of Object.entries(gcNodes)) {
			// Remove any leading slashes from the id.
			let normalizedId = trimLeadingSlashes(id);
			// Prefix the given id to the normalized id.
			normalizedId = `/${prefixId}/${normalizedId}`;
			// Remove any trailing slashes from the normalized id. Note that the trailing slashes are removed after
			// adding the prefix for handling the special case where id is "/".
			normalizedId = trimTrailingSlashes(normalizedId);

			// Add the outbound routes against the normalized and prefixed id without duplicates.
			this.gcNodesSet[normalizedId] = new Set(outboundRoutes);
		}
	}

	public addNodes(gcNodes: Record<string, string[]>): void {
		for (const [id, outboundRoutes] of Object.entries(gcNodes)) {
			this.gcNodesSet[id] = new Set(outboundRoutes);
		}
	}

	/**
	 * Adds the given outbound route to the outbound routes of all GC nodes.
	 */
	public addRouteToAllNodes(outboundRoute: string): void {
		for (const outboundRoutes of Object.values(this.gcNodesSet)) {
			outboundRoutes.add(outboundRoute);
		}
	}

	public getGCData(): IGarbageCollectionData {
		return {
			gcNodes: this.gcNodes,
		};
	}
}

/**
 * Adds `source` into `target` in place.
 *
 * @remarks
 * Unlike {@link mergeStats}, this mutates `target` rather than returning a new object, which lets a
 * {@link SummaryBuilder} node accumulate into its own stats object.
 */
function addStatsInPlace(target: ISummaryStats, source: ISummaryStats): void {
	target.treeNodeCount += source.treeNodeCount;
	target.blobNodeCount += source.blobNodeCount;
	target.handleNodeCount += source.handleNodeCount;
	target.totalBlobSize += source.totalBlobSize;
	target.unreferencedBlobSize += source.unreferencedBlobSize;
}

/**
 * Default implementation of {@link @fluidframework/runtime-definitions#ISummaryBuilder}.
 *
 * @remarks
 * A builder tree mirrors the summary tree being generated. Each node lazily attaches itself to its parent the
 * first time it produces content (or declares itself unchanged), which is what lets a node emit a handle without
 * its parent having to know anything about it up front.
 *
 * Stats are computed per node when they are asked for, by walking that node's own content and its children. This
 * means `getSummaryTreeWithStats` describes the subtree of the node it is called on, so a node can report its own
 * contribution (for example a shared object reporting its blob count) while the root still reports the totals for
 * the whole summary.
 *
 * @legacy @beta
 */
export class SummaryBuilder implements ISummaryBuilder {
	/**
	 * Path of this node in the summary tree, used as the handle when this node is unchanged.
	 * Matches the handle ids generated by the summarizer node hierarchy, e.g. `/.channels/dataStoreId`.
	 */
	private readonly fullPath: string;

	/**
	 * Notifies the parent builder that this node has produced content (`changed` true) or that it is reusing the
	 * previous summary (`changed` false). Undefined for the root builder.
	 */
	private readonly notifyParent:
		| ((changed: boolean, summaryObject: SummaryObject) => void)
		| undefined;

	/**
	 * Stats for the content added directly to this node. Content added through a child builder is accounted for
	 * by that child.
	 */
	private readonly ownStats: ISummaryStats;

	private readonly children: SummaryBuilder[] = [];

	/**
	 * The tree object handed to the parent. Kept stable so that later mutations (e.g. {@link markUnreferenced})
	 * are reflected in the parent's tree.
	 */
	private readonly summaryTree: ISummaryTree = {
		type: SummaryType.Tree,
		tree: {},
	};

	private state: "empty" | "changed" | "unchanged" = "empty";

	/**
	 * Creates the root builder for a summary.
	 * @param fullTree - True to prohibit handle reuse throughout the summary.
	 * @returns A builder for the root summary tree.
	 */
	public static createRootBuilder(fullTree: boolean): ISummaryBuilder {
		return new SummaryBuilder("" /* id */, fullTree, undefined /* childParams */);
	}

	private constructor(
		id: string,
		private readonly fullTree: boolean,
		childParams:
			| {
					parentPath: string;
					notifyParent: (changed: boolean, summaryObject: SummaryObject) => void;
			  }
			| undefined,
	) {
		this.fullPath = childParams === undefined ? "" : `${childParams.parentPath}/${id}`;
		this.notifyParent = childParams?.notifyParent;
		this.ownStats = mergeStats();
		this.ownStats.treeNodeCount++;
	}

	/** {@inheritDoc @fluidframework/runtime-definitions#ISummaryBuilder.getSummaryTreeWithStats} */
	public getSummaryTreeWithStats(): ISummaryTreeWithStats {
		return { summary: this.summaryTree, stats: this.getStats() };
	}

	/** {@inheritDoc @fluidframework/runtime-definitions#ISummaryBuilder.createBuilderForChild} */
	public createBuilderForChild(childId: string, fullTree: boolean): ISummaryBuilder {
		const child = new SummaryBuilder(childId, fullTree, {
			parentPath: this.fullPath,
			notifyParent: (changed: boolean, summaryObject: SummaryObject) => {
				assert(changed || !fullTree, "Summary cannot reuse a handle when fullTree is enabled");
				// A child attaches itself once - on its first content or on nodeDidNotChange. Its content makes
				// this node a tree, so this node has to attach itself too.
				this.markChanged();
				this.summaryTree.tree[childId] = summaryObject;
			},
		});
		this.children.push(child);
		return child;
	}

	/** {@inheritDoc @fluidframework/runtime-definitions#ISummaryBuilder.nodeDidNotChange} */
	public nodeDidNotChange(): void {
		assert(this.notifyParent !== undefined, "Root node cannot be a handle");
		assert(!this.fullTree, "Node cannot be a handle when fullTree is enabled");
		assert(
			this.state === "empty",
			"Node cannot be a handle after content has been added to it",
		);
		this.state = "unchanged";
		this.notifyParent(false /* changed */, {
			type: SummaryType.Handle,
			handle: this.fullPath,
			handleType: SummaryType.Tree,
		});
	}

	/** {@inheritDoc @fluidframework/runtime-definitions#ISummaryBuilder.addTree} */
	public addTree(key: string, summarizeResult: ISummarizeResult): void {
		this.markChanged();
		this.summaryTree.tree[key] = summarizeResult.summary;
		addStatsInPlace(this.ownStats, summarizeResult.stats);
	}

	/** {@inheritDoc @fluidframework/runtime-definitions#ISummaryBuilder.addHandle} */
	public addHandle(
		key: string,
		handleType: SummaryType.Tree | SummaryType.Blob | SummaryType.Attachment,
		handle: string,
	): void {
		assert(!this.fullTree, "Cannot add a handle when fullTree is enabled");
		this.markChanged();
		this.summaryTree.tree[key] = {
			type: SummaryType.Handle,
			handleType,
			handle,
		};
		this.ownStats.handleNodeCount++;
	}

	/** {@inheritDoc @fluidframework/runtime-definitions#ISummaryBuilder.addAttachment} */
	public addAttachment(key: string, id: string): void {
		this.markChanged();
		this.summaryTree.tree[key] = { id, type: SummaryType.Attachment };
	}

	/** {@inheritDoc @fluidframework/runtime-definitions#ISummaryBuilder.addBlob} */
	public addBlob(key: string, content: string | Uint8Array): void {
		this.markChanged();
		// Pass the live tree and stats so nothing is cloned.
		addBlobToSummary({ summary: this.summaryTree, stats: this.ownStats }, key, content);
	}

	/** {@inheritDoc @fluidframework/runtime-definitions#ISummaryBuilder.markUnreferenced} */
	public markUnreferenced(): void {
		this.markChanged();
		this.summaryTree.unreferenced = true;
	}

	/** {@inheritDoc @fluidframework/runtime-definitions#ISummaryBuilder.setGroupId} */
	public setGroupId(groupId: string): void {
		this.markChanged();
		this.summaryTree.groupId = groupId;
	}

	/**
	 * Stats for this node's subtree.
	 *
	 * @remarks
	 * Computed on demand rather than accumulated, so that it does not matter in which order a node adds its
	 * content, marks itself unreferenced or summarizes its children.
	 */
	private getStats(): ISummaryStats {
		if (this.state === "unchanged") {
			const handleStats = mergeStats();
			handleStats.handleNodeCount++;
			return handleStats;
		}

		const stats = mergeStats(
			this.ownStats,
			// A child that never produced content is not part of the summary.
			...this.children
				.filter((child) => child.state !== "empty")
				.map((child) => child.getStats()),
		);
		if (this.summaryTree.unreferenced === true) {
			// Everything under an unreferenced node is unreferenced, including content of nested unreferenced
			// nodes, so this is an assignment rather than an addition.
			stats.unreferencedBlobSize = stats.totalBlobSize;
		}
		return stats;
	}

	/**
	 * Attaches this node to its parent the first time it produces content.
	 */
	private markChanged(): void {
		assert(
			this.state !== "unchanged",
			"Content cannot be added to a node that declared itself unchanged",
		);
		if (this.state === "empty") {
			this.state = "changed";
			this.notifyParent?.(true /* changed */, this.summaryTree);
		}
	}
}
