/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	ISequencedDocumentMessage,
	ITree,
	ITreeEntry,
} from "@fluidframework/driver-definitions/internal";
import { TreeEntry } from "@fluidframework/driver-definitions/internal";
import {
	AttachmentTreeEntry,
	BlobTreeEntry,
	TreeTreeEntry,
} from "@fluidframework/driver-utils/internal";

/**
 * The name of the metadata blob added to the root of the container runtime.
 */
const metadataBlobName = ".metadata";

/**
 * The prefix that all GC blob names start with.
 *
 * @internal
 */
export const gcBlobPrefix = "__gc";

/**
 * The name of the legacy catch-up ops blob in Merge Tree.
 * @internal
 */
export const legacyCatchUpBlobName = "catchupOps";

/**
 * @internal
 */
export interface ISnapshotNormalizerConfig {
	// The paths of blobs whose contents should be normalized.
	blobsToNormalize?: string[];
	/**
	 * channel types who's content (non-attribute) blobs will be excluded.
	 * this is used to exclude the content of channels who's content cannot be compared
	 * as the content is non-deterministic between snapshot at the same sequence number.
	 */
	excludedChannelContentTypes?: string[];
}

const sortStringified = (elem1: unknown, elem2: unknown): number => {
	const serializedElem1 = JSON.stringify(elem1);
	const serializedElem2 = JSON.stringify(elem2);
	return serializedElem1.localeCompare(serializedElem2);
};

/**
 * Function that deep sorts an array. It handles cases where array elements are objects or arrays.
 * @returns the sorted array.
 */
function getDeepSortedArray(array: unknown[]): unknown[] {
	const sortedArray: unknown[] = [];
	// Sort arrays and objects, if any, in the array.
	for (const element of array) {
		if (Array.isArray(element)) {
			sortedArray.push(getDeepSortedArray(element));
		} else if (element instanceof Object) {
			sortedArray.push(getDeepSortedObject(element));
		} else {
			sortedArray.push(element);
		}
	}

	// Now that all the arrays and objects in this array's elements have been sorted, sort it by comparing each
	// element's stringified version.
	return sortedArray.sort(sortStringified);
}

/**
 * Function that deep sorts an object. It handles cases where object properties are arrays or objects.
 * @returns the sorted object.
 */
function getDeepSortedObject<T extends object>(obj: T): T {
	// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
	const sortedObj: T = {} as T;
	// Sort the object keys first. Then sort arrays and objects, if any, in the object.
	const keys = Object.keys(obj).sort();
	for (const key of keys) {
		const value: unknown = obj[key];
		if (Array.isArray(value)) {
			sortedObj[key] = getDeepSortedArray(value);
		} else if (value instanceof Object) {
			sortedObj[key] = getDeepSortedObject(value);
		} else {
			sortedObj[key] = value;
		}
	}

	return sortedObj;
}

/**
 * Function that normalizes a blob's content. If the content is an object or an array, deep sorts them.
 * Special handling for certain runtime blobs, such as the "gc" blob.
 * @returns the normalized blob content.
 */
function getNormalizedBlobContent(blobContent: string, blobName: string): string {
	let content = blobContent;
	if (blobName.startsWith(gcBlobPrefix)) {
		// The following code parses JSON and makes some assumptions about the type of data within. There does not appear to
		// be a better type than `any` to use here, so the lint rules are disabled.

		/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */

		// GC blobs may contain `unreferencedTimestampMs` for node that became unreferenced. This is the timestamp
		// of the last op processed or current timestamp and can differ between clients depending on when GC was run.
		// So, remove it for the purposes of comparing snapshots.
		const gcState: any = JSON.parse(content);
		// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
		for (const [, data] of Object.entries(gcState.gcNodes)) {
			delete (data as any).unreferencedTimestampMs;
		}
		content = JSON.stringify(gcState);
	}

	/**
	 * The legacy catch-up ops blob in merge tree DDS contains sequenced messages. These ops used to have metadata property.
	 * However, we stopped sending the metadata property to DDS because it was a Runtime layer concept. Remove the metadata
	 * property from the ops because latest snapshots won't have the metadata property.
	 */
	if (blobName === legacyCatchUpBlobName) {
		try {
			const catchupOps = JSON.parse(content) as ISequencedDocumentMessage[];
			if (catchupOps !== undefined && catchupOps.length > 0) {
				for (const [index, op] of catchupOps.entries()) {
					op.metadata = undefined;
					catchupOps[index] = op;
				}
			}
			content = JSON.stringify(catchupOps);
		} catch {
			// Do nothing
		}
	}

	/**
	 * The metadata blob has "summaryNumber" or "summaryCount" that tells which summary this is for a container. It can
	 * be different in summaries of two clients even if they are generated at the same sequence#. For instance, at seq#
	 * 1000, if one client has summarized 10 times and other has summarizer 15 times, summaryNumber will be different
	 * for them. So, update "summaryNumber" to 0 for purposes of comparing snapshots.
	 */
	if (blobName === metadataBlobName) {
		const metadata = JSON.parse(content);
		if (metadata.summaryNumber !== undefined) {
			metadata.summaryNumber = 0;
		}
		if (metadata.summaryCount !== undefined) {
			metadata.summaryCount = 0;
		}
		// "telemetryDocumentId" is not a deterministic property (random guid), so we need to set it to something consistent
		if (metadata.telemetryDocumentId !== undefined) {
			metadata.telemetryDocumentId = "x";
		}
		// default was not written before, now it's written in.
		if (metadata.documentSchema !== undefined) {
			metadata.documentSchema = undefined;
		}
		content = JSON.stringify(metadata);
	}

	// Deep sort the content if it's parseable.
	try {
		let contentObj = JSON.parse(content);
		if (Array.isArray(contentObj)) {
			contentObj = getDeepSortedArray(contentObj);
		} else if (contentObj instanceof Object) {
			contentObj = getDeepSortedObject(contentObj);
		}
		content = JSON.stringify(contentObj);
	} catch {
		// Do nothing
	}

	/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */

	return content;
}

/**
 * Helper function that normalizes the given snapshot tree. It sorts objects and arrays in the snapshot. It also
 * normalizes certain blob contents for which the order of content does not matter. For example, garbage collection
 * blobs contains objects / arrays whose element order do not matter.
 * @param snapshot - The snapshot tree to normalize.
 * @param config - Configs to use when normalizing snapshot. For example, it can contain paths of blobs whose contents
 * should be normalized as well.
 * @returns a copy of the normalized snapshot tree.
 * @internal
 */
export function getNormalizedSnapshot(
	snapshot: ITree,
	config?: ISnapshotNormalizerConfig,
): ITree {
	// Merge blobs to normalize in the config with runtime blobs to normalize. The contents of these blobs will be
	// parsed and deep sorted.
	const normalizedEntries: ITreeEntry[] = [];

	// The metadata blob in the root of the summary tree needs to be normalized.
	const blobsToNormalize = [metadataBlobName, ...(config?.blobsToNormalize ?? [])];
	for (const entry of snapshot.entries) {
		normalizedEntries.push(normalizeEntry(entry, { ...config, blobsToNormalize }));
	}

	// Sort the tree entries based on their path.
	normalizedEntries.sort((a, b) => a.path.localeCompare(b.path));

	return {
		entries: normalizedEntries,
		id: snapshot.id,
	};
}

function normalizeMatrix(value: ITree): ITree {
	const rows = value.entries.find((e) => e.path === "rows");

	if (!rows || !("entries" in rows.value)) {
		return value;
	}

	const segments = rows.value.entries.find((e) => e.path === "segments");

	if (!segments || !("entries" in segments.value)) {
		return value;
	}

	const header = segments.value.entries.find((e) => e.path === "header");

	if (!header || !("contents" in header.value)) {
		return value;
	}

	if (!header?.value.contents.includes("removedClientId")) {
		return value;
	}

	/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */

	const contents = JSON.parse(header?.value.contents);

	for (const segment of contents.segments) {
		if ("removedClientId" in segment) {
			segment.removedClientId = undefined;
		}

		if ("removedClientIds" in segment) {
			segment.removedClientIds = undefined;
		}
	}

	header.value.contents = JSON.stringify(contents);

	/* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */

	return value;
}

function normalizeEntry(
	entry: ITreeEntry,
	config: ISnapshotNormalizerConfig | undefined,
): ITreeEntry {
	switch (entry.type) {
		case TreeEntry.Blob: {
			let contents = entry.value.contents;
			// If this blob has to be normalized, it's a GC or legacy catchup blob, parse and sort the blob contents first.
			if (
				(config?.blobsToNormalize?.includes(entry.path) ?? false) ||
				entry.path.startsWith(gcBlobPrefix) ||
				entry.path === legacyCatchUpBlobName
			) {
				contents = getNormalizedBlobContent(contents, entry.path);
			}
			return new BlobTreeEntry(entry.path, contents);
		}
		case TreeEntry.Tree: {
			if (config?.excludedChannelContentTypes !== undefined) {
				for (const maybeAttributes of entry.value.entries) {
					if (
						maybeAttributes.type === TreeEntry.Blob &&
						maybeAttributes.path === ".attributes"
					) {
						// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
						const parsed: { type?: string } = JSON.parse(maybeAttributes.value.contents);
						if (parsed.type === "https://graph.microsoft.com/types/sharedmatrix") {
							return new TreeTreeEntry(
								entry.path,
								normalizeMatrix(getNormalizedSnapshot(entry.value, config)),
							);
						}
						if (
							parsed.type !== undefined &&
							config.excludedChannelContentTypes.includes(parsed.type)
						) {
							// remove everything to match the unknown channel
							return new TreeTreeEntry(entry.path, { entries: [maybeAttributes] });
						}
					}
				}
			}

			return new TreeTreeEntry(entry.path, getNormalizedSnapshot(entry.value, config));
		}
		case TreeEntry.Attachment: {
			return new AttachmentTreeEntry(entry.path, entry.value.id);
		}

		default: {
			throw new Error("Unknown entry type");
		}
	}
}
