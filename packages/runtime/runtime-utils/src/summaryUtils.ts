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
import { ISnapshotTreeWithBlobContents } from "@fluidframework/container-definitions/internal";
import { assert, unreachableCase } from "@fluidframework/core-utils/internal";
import {
	ISummaryBlob,
	ISummaryTree,
	SummaryObject,
	SummaryType,
} from "@fluidframework/driver-definitions";
import { ITree, ITreeEntry, TreeEntry } from "@fluidframework/driver-definitions/internal";
import {
	AttachmentTreeEntry,
	BlobTreeEntry,
	TreeTreeEntry,
} from "@fluidframework/driver-utils/internal";
import {
	ISummaryStats,
	ISummaryTreeWithStats,
	ITelemetryContext,
	IGarbageCollectionData,
	ISummarizeResult,
	ITelemetryContextExt,
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
 * @internal
 */
export function utf8ByteLength(str: string): number {
	// returns the byte length of an utf8 string
	let s = str.length;
	for (let i = str.length - 1; i >= 0; i--) {
		const code = str.charCodeAt(i);
		if (code > 0x7f && code <= 0x7ff) {
			s++;
		} else if (code > 0x7ff && code <= 0xffff) {
			s += 2;
		}
		if (code >= 0xdc00 && code <= 0xdfff) {
			i--; // trail surrogate
		}
	}
	return s;
}

/**
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
		default:
			return;
	}
}

/**
 * @internal
 */
export function calculateStats(summary: SummaryObject): ISummaryStats {
	const stats = mergeStats();
	calculateStatsCore(summary, stats);
	return stats;
}

/**
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
 * @legacy
 * @alpha
 */
export class SummaryTreeBuilder implements ISummaryTreeWithStats {
	private attachmentCounter: number = 0;

	public get summary(): ISummaryTree {
		return {
			type: SummaryType.Tree,
			tree: { ...this.summaryTree },
		};
	}

	public get stats(): Readonly<ISummaryStats> {
		return { ...this.summaryStats };
	}

	constructor() {
		this.summaryStats = mergeStats();
		this.summaryStats.treeNodeCount++;
	}

	private readonly summaryTree: { [path: string]: SummaryObject } = {};
	private summaryStats: ISummaryStats;

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

	public addWithStats(key: string, summarizeResult: ISummarizeResult): void {
		this.summaryTree[key] = summarizeResult.summary;
		this.summaryStats = mergeStats(this.summaryStats, summarizeResult.stats);
	}

	public addAttachment(id: string) {
		this.summaryTree[this.attachmentCounter++] = { id, type: SummaryType.Attachment };
	}

	public getSummaryTree(): ISummaryTreeWithStats {
		return { summary: this.summary, stats: this.stats };
	}
}

/**
 * Converts snapshot ITree to ISummaryTree format and tracks stats.
 * @param snapshot - snapshot in ITree format
 * @param fullTree - true to never use handles, even if id is specified
 * @legacy
 * @alpha
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

			default:
				throw new Error("Unexpected TreeEntry type");
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
			const content: ArrayBufferLike = snapshot.blobsContents[id];
			if (content !== undefined) {
				decoded = bufferToString(content, "utf-8");
			}
			// 0.44 back-compat We still put contents in same blob for back-compat so need to add blob
			// only for blobPath -> blobId mapping and not for blobId -> blob value contents.
		} else if (snapshot.blobs[id] !== undefined) {
			decoded = fromBase64ToUtf8(snapshot.blobs[id]);
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

			default:
				unreachableCase(value, "Unexpected summary tree type");
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
	snapshot: ITree | null,
	addedGCOutboundRoute: (fromNodeId: string, toPath: string) => void,
): boolean {
	const gcDataEntry = snapshot?.entries.find((e) => e.path === gcDataBlobKey);

	// Old attach messages won't have GC Data
	// (And REALLY old DataStore Attach messages won't even have a snapshot!)
	if (gcDataEntry === undefined) {
		return false;
	}

	assert(
		gcDataEntry.type === TreeEntry.Blob && gcDataEntry.value.encoding === "utf-8",
		0x8ff /* GC data should be a utf-8-encoded blob */,
	);

	const gcData = JSON.parse(gcDataEntry.value.contents) as IGarbageCollectionData;
	for (const [nodeId, outboundRoutes] of Object.entries(gcData.gcNodes)) {
		outboundRoutes.forEach((toPath) => {
			addedGCOutboundRoute(nodeId, toPath);
		});
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
	set(prefix: string, property: string, value: TelemetryEventPropertyTypeExt): void {
		this.telemetry.set(`${prefix}${property}`, value);
	}

	/**
	 * {@inheritDoc @fluidframework/runtime-definitions#ITelemetryContext.setMultiple}
	 */
	setMultiple(
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
	 * {@inheritDoc @fluidframework/runtime-definitions#ITelemetryContext.get}
	 */
	get(prefix: string, property: string): TelemetryEventPropertyTypeExt {
		return this.telemetry.get(`${prefix}${property}`);
	}

	/**
	 * {@inheritDoc @fluidframework/runtime-definitions#ITelemetryContext.serialize}
	 */
	serialize(): string {
		const jsonObject = {};
		this.telemetry.forEach((value, key) => {
			jsonObject[key] = value;
		});
		return JSON.stringify(jsonObject);
	}
}

/**
 * Trims the leading slashes from the given string.
 * @param str - A string that may contain leading slashes.
 * @returns A new string without leading slashes.
 */
function trimLeadingSlashes(str: string) {
	return str.replace(/^\/+/g, "");
}

/**
 * Trims the trailing slashes from the given string.
 * @param str - A string that may contain trailing slashes.
 * @returns A new string without trailing slashes.
 */
function trimTrailingSlashes(str: string) {
	return str.replace(/\/+$/g, "");
}

/**
 * Helper class to build the garbage collection data of a node by combining the data from multiple nodes.
 * @internal
 */
export class GCDataBuilder implements IGarbageCollectionData {
	private readonly gcNodesSet: { [id: string]: Set<string> } = {};
	public get gcNodes(): { [id: string]: string[] } {
		const gcNodes = {};
		for (const [nodeId, outboundRoutes] of Object.entries(this.gcNodesSet)) {
			gcNodes[nodeId] = [...outboundRoutes];
		}
		return gcNodes;
	}

	public addNode(id: string, outboundRoutes: string[]) {
		this.gcNodesSet[id] = new Set(outboundRoutes);
	}

	/**
	 * Adds the given GC nodes. It does the following:
	 * - Normalizes the ids of the given nodes.
	 * - Prefixes the given `prefixId` to the given nodes' ids.
	 * - Adds the outbound routes of the nodes against the normalized and prefixed id.
	 */
	public prefixAndAddNodes(prefixId: string, gcNodes: { [id: string]: string[] }) {
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

	public addNodes(gcNodes: { [id: string]: string[] }) {
		for (const [id, outboundRoutes] of Object.entries(gcNodes)) {
			this.gcNodesSet[id] = new Set(outboundRoutes);
		}
	}

	/**
	 * Adds the given outbound route to the outbound routes of all GC nodes.
	 */
	public addRouteToAllNodes(outboundRoute: string) {
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
