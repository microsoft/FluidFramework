/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IContainerStorageService } from "@fluidframework/container-definitions/internal";
import type {
	ISnapshotTree,
	ISummaryBlob,
	ISummaryTree,
	SummaryObject,
} from "@fluidframework/driver-definitions";
import { SummaryType } from "@fluidframework/driver-definitions";

const materializeSummaryScenarioName = "MaterializeFullTreeSummary";

type SnapshotStorage = Pick<
	IContainerStorageService,
	"getSnapshotTree" | "getVersions" | "readBlob"
>;

/**
 * Fetches the exact snapshot used as the parent of an incremental summary.
 */
export async function fetchSnapshotForSummary(
	storage: SnapshotStorage,
	versionId: string,
): Promise<ISnapshotTree> {
	const versions = await storage.getVersions(versionId, 1, materializeSummaryScenarioName);
	const version = versions[0];
	if (version === undefined) {
		throw new Error(`Could not resolve parent summary version "${versionId}".`);
	}

	const snapshot = await storage.getSnapshotTree(version, materializeSummaryScenarioName);
	if (snapshot === null) {
		throw new Error(`Could not fetch parent summary snapshot "${versionId}".`);
	}
	return snapshot;
}

/**
 * Replaces every summary handle with content from the parent snapshot.
 */
export async function materializeSummary(
	summary: ISummaryTree,
	parentSnapshot: ISnapshotTree,
	readBlob: (id: string) => Promise<ArrayBufferLike>,
): Promise<ISummaryTree> {
	const entries = await Promise.all(
		Object.entries(summary.tree).map(
			async ([key, value]) =>
				[key, await materializeSummaryObject(value, parentSnapshot, readBlob)] as const,
		),
	);
	return {
		...summary,
		tree: Object.fromEntries(entries),
	};
}

async function materializeSummaryObject(
	object: SummaryObject,
	parentSnapshot: ISnapshotTree,
	readBlob: (id: string) => Promise<ArrayBufferLike>,
): Promise<SummaryObject> {
	switch (object.type) {
		case SummaryType.Tree:
			return materializeSummary(object, parentSnapshot, readBlob);
		case SummaryType.Blob:
		case SummaryType.Attachment:
			return object;
		case SummaryType.Handle: {
			switch (object.handleType) {
				case SummaryType.Tree:
					return materializeSnapshotTree(
						resolveSnapshotTree(parentSnapshot, object.handle),
						readBlob,
					);
				case SummaryType.Blob:
					return materializeSnapshotBlob(
						resolveSnapshotBlob(parentSnapshot, object.handle),
						readBlob,
					);
				default:
					throw new Error("Unsupported summary handle type.");
			}
		}
		default:
			throw new Error("Unsupported summary object type.");
	}
}

async function materializeSnapshotTree(
	snapshot: ISnapshotTree,
	readBlob: (id: string) => Promise<ArrayBufferLike>,
): Promise<ISummaryTree> {
	const [blobs, trees] = await Promise.all([
		Promise.all(
			Object.entries(snapshot.blobs).map(
				async ([key, id]) => [key, await materializeSnapshotBlob(id, readBlob)] as const,
			),
		),
		Promise.all(
			Object.entries(snapshot.trees).map(
				async ([key, tree]) => [key, await materializeSnapshotTree(tree, readBlob)] as const,
			),
		),
	]);

	return {
		type: SummaryType.Tree,
		tree: Object.fromEntries([...blobs, ...trees]),
		unreferenced: snapshot.unreferenced,
		groupId: snapshot.groupId,
	};
}

async function materializeSnapshotBlob(
	id: string,
	readBlob: (id: string) => Promise<ArrayBufferLike>,
): Promise<ISummaryBlob> {
	return {
		type: SummaryType.Blob,
		content: new Uint8Array(await readBlob(id)),
	};
}

function resolveSnapshotTree(snapshot: ISnapshotTree, handle: string): ISnapshotTree {
	const path = getHandlePath(handle);
	if (path.length === 0) {
		return snapshot;
	}

	let current = snapshot;
	for (const key of path) {
		const next = current.trees[key];
		if (next === undefined) {
			throw new Error(`Parent summary does not contain tree handle "${handle}".`);
		}
		current = next;
	}
	return current;
}

function resolveSnapshotBlob(snapshot: ISnapshotTree, handle: string): string {
	const path = getHandlePath(handle);
	const blobName = path.pop();
	if (blobName === undefined) {
		throw new Error("A blob summary handle cannot reference the snapshot root.");
	}

	let current = snapshot;
	for (const key of path) {
		const next = current.trees[key];
		if (next === undefined) {
			throw new Error(`Parent summary does not contain blob handle "${handle}".`);
		}
		current = next;
	}

	const blobId = current.blobs[blobName];
	if (blobId === undefined) {
		throw new Error(`Parent summary does not contain blob handle "${handle}".`);
	}
	return blobId;
}

function getHandlePath(handle: string): string[] {
	const path = handle.split("/");
	if (path[0] === "") {
		path.shift();
	}
	return path.map((part) => decodeURIComponent(part));
}
