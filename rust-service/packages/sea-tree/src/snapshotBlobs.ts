/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ISummaryTree } from "@fluidframework/driver-definitions";
import type { SummaryEntry } from "@fluidframework/sea-driver/internal";

import { type BlobHandles, validateBlobId } from "./blobHandles.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const contentName = ".content";
const referencesName = ".handles";

/**
 * Keeps each serialized blob and its outgoing edges in one reusable directory.
 * Incremental blob handles become directory handles without changing their logical paths.
 */
export async function encodeSnapshotBlobs(
	tree: ISummaryTree,
	blobs: BlobHandles,
	references: ReturnType<BlobHandles["captureSummary"]>["references"],
): Promise<ISummaryTree> {
	const result: ISummaryTree = { type: 1, tree: {} };
	for (const [name, object] of Object.entries(tree.tree)) {
		switch (object.type) {
			case 1:
				result.tree[name] = await encodeSnapshotBlobs(object, blobs, references);
				break;
			case 2: {
				const handles =
					typeof object.content === "string" ? references.get(object.content) : undefined;
				const attached: ISummaryTree = { type: 1, tree: {} };
				if (handles !== undefined) {
					for (const [id, digest] of Object.entries(await blobs.uploadReferences(handles))) {
						attached.tree[id] = { type: 4, id: digest };
					}
				}
				result.tree[name] = {
					type: 1,
					tree: {
						[contentName]: object,
						...(Object.keys(attached.tree).length === 0 ? {} : { [referencesName]: attached }),
					},
				};
				break;
			}
			case 3:
				result.tree[name] = { ...object, handleType: 1 };
				break;
			default:
				throw new Error("Unsupported direct SharedTree summary object");
		}
	}
	return result;
}

/** Distinguishes application payload edges from summary data before bulk loading. */
export function isHandlePayload(entry: SummaryEntry): boolean {
	return decoder.decode(entry.path).includes(`/${referencesName}/`);
}

/** Restores logical SharedTree paths and registers lazy or already-prefetched attachments. */
export async function decodeSnapshotBlobs(
	entries: readonly SummaryEntry[],
	blobs: BlobHandles,
	prefetched: ReadonlyMap<string, Promise<Uint8Array>>,
	key: (digest: Uint8Array) => string,
): Promise<SummaryEntry[]> {
	const result: SummaryEntry[] = [];
	for (const entry of entries) {
		const path = decoder.decode(entry.path);
		if (path === ".sea-direct") {
			result.push(entry);
		} else if (isHandlePayload(entry)) {
			const id = path.slice(
				path.lastIndexOf(`/${referencesName}/`) + referencesName.length + 2,
			);
			validateBlobId(id);
			blobs.register(id, entry.blob, await prefetched.get(key(entry.blob)));
		} else if (path.endsWith(`/${contentName}`)) {
			result.push({
				path: encoder.encode(path.slice(0, -contentName.length - 1)),
				blob: entry.blob,
			});
		} else {
			throw new Error(`Invalid direct summary blob path: ${path}`);
		}
	}
	return result;
}
