/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { bufferToString, stringToBuffer } from "@fluid-internal/client-utils";
import {
	SummaryType,
	type ISummaryTree,
	type SummaryObject,
} from "@fluidframework/driver-definitions";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

/** Snapshot catalog key. Payloads are attachment blobs, not boot snapshot blobs. */
export const nativeCheckpointKey = ".nativeCheckpoints";

/**
 * An immutable checkpoint and the blob routes that keep it readable.
 * @internal
 */
export interface NativeCheckpoint {
	readonly id: string;
	readonly sequenceNumber: number;
	readonly route: string;
	readonly bytes: number;
	readonly assets: readonly string[];
	/** Immediate delta dependency. Omitted for independent anchors and legacy payloads. */
	readonly baseId?: string;
	/** Number of delta edges to an independent anchor. Legacy entries have depth zero. */
	readonly depth?: number;
}

/** The application-state boundary, distinct from the service epoch. */
export interface NativeCheckpointRestore {
	readonly id: string;
	readonly checkpointId: string;
	readonly sequenceNumber: number;
}

/** Persisted state of the experimental native checkpoint feature. */
export interface NativeCheckpointState {
	readonly version: 1;
	readonly checkpoints: NativeCheckpoint[];
	readonly restored?: NativeCheckpointRestore;
}

/** Sequenced control messages. They must not be grouped with application edits. */
export type NativeCheckpointMessage =
	| { readonly action: "store"; readonly checkpoint: NativeCheckpoint }
	| { readonly action: "restore"; readonly id: string; readonly checkpointId: string }
	| { readonly action: "complete"; readonly id: string };

/** Returns whether a parsed value is a record. */
export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Validates the catalog's explicit attachment roots. */
function parseCheckpoint(value: unknown): NativeCheckpoint {
	if (!isRecord(value)) {
		throw new UsageError("Invalid native checkpoint catalog entry");
	}
	const route: unknown = value.route;
	const assets: unknown = value.assets;
	if (
		typeof value.id !== "string" ||
		typeof value.sequenceNumber !== "number" ||
		!Number.isSafeInteger(value.sequenceNumber) ||
		value.sequenceNumber < 0 ||
		typeof route !== "string" ||
		!route.startsWith("/_blobs/") ||
		typeof value.bytes !== "number" ||
		!Number.isSafeInteger(value.bytes) ||
		value.bytes < 0 ||
		(value.baseId !== undefined && typeof value.baseId !== "string") ||
		(value.depth !== undefined &&
			(typeof value.depth !== "number" ||
				!Number.isSafeInteger(value.depth) ||
				value.depth < 0 ||
				value.depth > 4)) ||
		(value.baseId !== undefined && !(typeof value.depth === "number" && value.depth > 0)) ||
		(value.baseId === undefined && (value.depth ?? 0) !== 0) ||
		!Array.isArray(assets) ||
		!assets.every(
			(asset: unknown): asset is string =>
				typeof asset === "string" && asset.startsWith("/_blobs/"),
		)
	) {
		throw new UsageError("Invalid native checkpoint catalog entry");
	}
	return {
		id: value.id,
		sequenceNumber: value.sequenceNumber,
		route,
		bytes: value.bytes,
		assets,
		baseId: value.baseId,
		depth: value.depth,
	};
}

/** Validates control messages before they affect runtime state. */
export function parseNativeCheckpointMessage(value: unknown): NativeCheckpointMessage {
	if (isRecord(value)) {
		if (value.action === "store") {
			return { action: "store", checkpoint: parseCheckpoint(value.checkpoint) };
		}
		if (
			value.action === "restore" &&
			typeof value.id === "string" &&
			typeof value.checkpointId === "string"
		) {
			return { action: "restore", id: value.id, checkpointId: value.checkpointId };
		}
		if (value.action === "complete" && typeof value.id === "string") {
			return { action: "complete", id: value.id };
		}
	}
	throw new UsageError("Invalid native checkpoint control message");
}

/** Validates the boot catalog independently of lazily downloaded checkpoint payloads. */
export function parseNativeCheckpointState(value: unknown): NativeCheckpointState | undefined {
	if (value === undefined) {
		return undefined;
	}
	if (!isRecord(value) || value.version !== 1) {
		throw new UsageError("Invalid native checkpoint catalog");
	}
	const entries: unknown = value.checkpoints;
	if (!Array.isArray(entries)) {
		throw new UsageError("Invalid native checkpoint catalog");
	}
	const checkpoints = entries.map((checkpoint: unknown) => parseCheckpoint(checkpoint));
	if (new Set(checkpoints.map((checkpoint) => checkpoint.id)).size !== checkpoints.length) {
		throw new UsageError("Duplicate native checkpoint IDs");
	}
	for (const checkpoint of checkpoints) {
		if (checkpoint.baseId !== undefined) {
			const base = checkpoints.find((entry) => entry.id === checkpoint.baseId);
			if (base === undefined || checkpoint.depth !== (base.depth ?? 0) + 1) {
				throw new UsageError("Invalid native checkpoint catalog dependency");
			}
		}
	}
	if (value.restored === undefined) {
		return { version: 1, checkpoints };
	}
	const restored: unknown = value.restored;
	if (
		!isRecord(restored) ||
		typeof restored.id !== "string" ||
		typeof restored.checkpointId !== "string" ||
		typeof restored.sequenceNumber !== "number" ||
		!Number.isSafeInteger(restored.sequenceNumber) ||
		restored.sequenceNumber < 0 ||
		!checkpoints.some((checkpoint) => checkpoint.id === restored.checkpointId)
	) {
		throw new UsageError("Invalid native checkpoint restore boundary");
	}
	return {
		version: 1,
		checkpoints,
		restored: {
			id: restored.id,
			checkpointId: restored.checkpointId,
			sequenceNumber: restored.sequenceNumber,
		},
	};
}

/** Decodes a self-contained summary without resolving historical summary handles. */
function decodeSummary(value: unknown): SummaryObject {
	if (!isRecord(value)) {
		throw new UsageError("Invalid native checkpoint summary node");
	}
	switch (value.type) {
		case SummaryType.Tree: {
			if (!isRecord(value.tree) || value.groupId !== undefined) {
				throw new UsageError("Native checkpoints require ungrouped content");
			}
			const tree: ISummaryTree = { type: SummaryType.Tree, tree: {} };
			if (value.unreferenced === true) {
				tree.unreferenced = true;
			}
			for (const [key, child] of Object.entries(value.tree)) {
				Object.defineProperty(tree.tree, key, {
					value: decodeSummary(child),
					enumerable: true,
					writable: true,
					configurable: true,
				});
			}
			return tree;
		}
		case SummaryType.Blob: {
			if (typeof value.content === "string") {
				return { type: SummaryType.Blob, content: value.content };
			}
			if (typeof value.base64 === "string") {
				const content = new Uint8Array(stringToBuffer(value.base64, "base64"));
				if (bufferToString(content, "base64") !== value.base64) {
					throw new UsageError("Invalid native checkpoint binary encoding");
				}
				return { type: SummaryType.Blob, content };
			}
			const binary: unknown = value.binary;
			if (
				Array.isArray(binary) &&
				binary.every(
					(byte: unknown) =>
						typeof byte === "number" && Number.isInteger(byte) && byte >= 0 && byte <= 255,
				)
			) {
				return { type: SummaryType.Blob, content: Uint8Array.from(binary) };
			}
			break;
		}
		case SummaryType.Attachment: {
			if (typeof value.id === "string") {
				return { type: SummaryType.Attachment, id: value.id };
			}
			break;
		}
		default: {
			break;
		}
	}
	throw new UsageError("Invalid or non-materialized native checkpoint summary");
}

/** Encodes native structural bytes. Attachment nodes contain IDs, never image bytes. */
export function encodeNativeCheckpoint(summary: ISummaryTree): Uint8Array {
	// Use a node-aware encoder so binary content cannot be confused with user JSON.
	function encodeNode(node: SummaryObject): unknown {
		switch (node.type) {
			case SummaryType.Tree: {
				if (node.groupId !== undefined) {
					throw new UsageError("Native checkpoints require ungrouped content");
				}
				return {
					type: node.type,
					unreferenced: node.unreferenced,
					tree: Object.fromEntries(
						Object.entries(node.tree).map(([key, child]) => [key, encodeNode(child)]),
					),
				};
			}
			case SummaryType.Blob: {
				return typeof node.content === "string"
					? node
					: { type: node.type, base64: bufferToString(node.content, "base64") };
			}
			case SummaryType.Attachment: {
				return node;
			}
			default: {
				throw new UsageError("Native checkpoints cannot retain summary handles");
			}
		}
	}
	return new TextEncoder().encode(
		JSON.stringify({ version: 2, summary: encodeNode(summary) }),
	);
}

/** Reads the versioned native package and creates independently owned summary nodes. */
export function decodeNativeCheckpoint(bytes: ArrayBufferLike): ISummaryTree {
	const value: unknown = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes)));
	if (!isRecord(value) || (value.version !== 1 && value.version !== 2)) {
		throw new UsageError("Unsupported native checkpoint format");
	}
	const summary = decodeSummary(value.summary);
	if (summary.type !== SummaryType.Tree) {
		throw new UsageError("Native checkpoint root must be a tree");
	}
	return summary;
}
