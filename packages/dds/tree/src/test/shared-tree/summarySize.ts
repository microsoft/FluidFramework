/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { SummaryType, type ISummaryTree } from "@fluidframework/driver-definitions";

import type { JsonCompatibleReadOnly } from "../../util/index.js";

/**
 * Uncompressed blob payload sizes, in bytes, from a full SharedTree summary.
 * Excludes summary-tree envelopes, service compression, and in-memory object sizes.
 */
export interface SummarySize {
	totalBytes: number;
	forestBytes: number;
	historyBytes: number;
	otherBytes: number;
	/** Portion of historyBytes attributable to persisted customer metadata, including its JSON framing. */
	customMetadataBytes: number;
	/** Total bytes excluding the customer metadata contribution. */
	sharedTreeBytes: number;
}

/**
 * Copies the encoded history without commit metadata.
 * Never descends into change payloads or customer metadata: either can contain similarly named fields.
 */
function withoutCustomMetadata(value: JsonCompatibleReadOnly): JsonCompatibleReadOnly {
	if (Array.isArray(value)) {
		return value.map(withoutCustomMetadata);
	}
	if (value === null || typeof value !== "object") {
		return value;
	}
	const isCommit = "revision" in value && "sessionId" in value && "change" in value;
	return Object.fromEntries(
		Object.entries(value)
			.filter(([key]) => !(isCommit && key === "customMetadata"))
			.map(([key, child]) => [
				key,
				child === undefined || key === "change" || key === "customMetadata"
					? child
					: withoutCustomMetadata(child),
			]),
	);
}

/**
 * Measures actual UTF-8/binary blob lengths and attributes bytes by summary component.
 * @remarks
 * Handles are rejected: counting only newly uploaded blobs would undercount an incremental summary.
 * Customer metadata attribution is the difference between the encoded history JSON with and
 * without commit metadata. It is not the size of a separate physical storage blob.
 * Forest bytes include any retained detached content; they are not just visible document content.
 */
export function measureSummarySize(summary: ISummaryTree): SummarySize {
	const result: SummarySize = {
		totalBytes: 0,
		forestBytes: 0,
		historyBytes: 0,
		otherBytes: 0,
		customMetadataBytes: 0,
		sharedTreeBytes: 0,
	};
	function visit(
		tree: ISummaryTree,
		component: "forestBytes" | "historyBytes" | "otherBytes",
	): void {
		for (const [key, item] of Object.entries(tree.tree)) {
			switch (item.type) {
				case SummaryType.Tree: {
					visit(
						item,
						key === "Forest"
							? "forestBytes"
							: key === "EditManager"
								? "historyBytes"
								: component,
					);
					break;
				}
				case SummaryType.Blob: {
					const size =
						typeof item.content === "string"
							? Buffer.byteLength(item.content, "utf8")
							: item.content.byteLength;
					result.totalBytes += size;
					result[component] += size;
					if (component === "historyBytes") {
						const text =
							typeof item.content === "string"
								? item.content
								: Buffer.from(item.content).toString("utf8");
						const encoded = JSON.parse(text) as JsonCompatibleReadOnly;
						const metadataBytes =
							Buffer.byteLength(JSON.stringify(encoded), "utf8") -
							Buffer.byteLength(JSON.stringify(withoutCustomMetadata(encoded)), "utf8");
						assert(metadataBytes >= 0 && metadataBytes <= size);
						result.customMetadataBytes += metadataBytes;
					}
					break;
				}
				case SummaryType.Handle: {
					assert.fail("Size measurement requires a full summary without handles");
				}
				case SummaryType.Attachment: {
					assert.fail("Size measurement cannot resolve attachment payloads");
				}
				default: {
					assert.fail("Unknown summary entry");
				}
			}
		}
	}
	visit(summary, "otherBytes");
	result.sharedTreeBytes = result.totalBytes - result.customMetadataBytes;
	return result;
}

/**
 * Counts persisted commit entries in all branches and peer histories, including duplicated entries.
 * This is distinct from the main branch's retained commit count.
 */
export function measureStoredHistory(summary: ISummaryTree): {
	storedCommits: number;
	storedAnnotatedCommits: number;
	storedUnannotatedCommits: number;
} {
	let storedCommits = 0;
	let storedAnnotatedCommits = 0;
	function visit(tree: ISummaryTree, inHistory: boolean): void {
		for (const [key, item] of Object.entries(tree.tree)) {
			if (item.type === SummaryType.Tree) {
				visit(item, inHistory || key === "EditManager");
			} else if (inHistory && item.type === SummaryType.Blob) {
				const text =
					typeof item.content === "string"
						? item.content
						: Buffer.from(item.content).toString("utf8");
				const pending: JsonCompatibleReadOnly[] = [JSON.parse(text) as JsonCompatibleReadOnly];
				while (pending.length > 0) {
					const value = pending.pop();
					if (Array.isArray(value)) {
						pending.push(...value);
					} else if (value !== null && typeof value === "object") {
						if ("revision" in value && "sessionId" in value && "change" in value) {
							storedCommits++;
							if (value.customMetadata !== undefined) {
								storedAnnotatedCommits++;
							}
						}
						for (const [field, child] of Object.entries(value)) {
							if (child !== undefined && field !== "change" && field !== "customMetadata") {
								pending.push(child);
							}
						}
					}
				}
			} else if (inHistory) {
				assert.fail("History counts require full summary blobs");
			}
		}
	}
	visit(summary, false);
	return {
		storedCommits,
		storedAnnotatedCommits,
		storedUnannotatedCommits: storedCommits - storedAnnotatedCommits,
	};
}
