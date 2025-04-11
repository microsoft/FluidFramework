/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { stringToBuffer } from "@fluid-internal/client-utils";
import type { IErrorBase } from "@fluidframework/container-definitions/internal";
import { ISnapshotTree } from "@fluidframework/driver-definitions/internal";

import { ISerializableBlobContents } from "./containerStorageAdapter.js";

// This is used when we rehydrate a container from the snapshot. Here we put the blob contents
// in separate property: blobContents.
export interface ISnapshotTreeWithBlobContents extends ISnapshotTree {
	blobsContents: { [path: string]: ArrayBufferLike };
	trees: { [path: string]: ISnapshotTreeWithBlobContents };
}

export interface IConnectionStateChangeReason<T extends IErrorBase = IErrorBase> {
	text: string;
	error?: T;
}

/**
 * Interface to represent the parsed parts of IResolvedUrl.url to help
 * in getting info about different parts of the url.
 * May not be compatible or relevant for any Url Resolver
 * @legacy
 * @alpha
 */
export interface IParsedUrl {
	/**
	 * It is combination of tenantid/docId part of the url.
	 */
	id: string;
	/**
	 * It is the deep link path in the url.
	 */
	path: string;
	/**
	 * Query string part of the url.
	 */
	query: string;
	/**
	 * Undefined means load latest snapshot, otherwise it's version ID passed to IDocumentStorageService.getVersions()
	 * to figure out what snapshot to use.
	 */
	version: string | undefined;
}

export const combineSnapshotTreeAndSnapshotBlobs = (
	baseSnapshot: ISnapshotTree,
	snapshotBlobs: ISerializableBlobContents,
): ISnapshotTreeWithBlobContents => {
	const blobsContents: { [path: string]: ArrayBufferLike } = {};

	// Process blobs in the current level
	for (const [, id] of Object.entries(baseSnapshot.blobs)) {
		if (snapshotBlobs[id]) {
			blobsContents[id] = stringToBuffer(snapshotBlobs[id], "utf8");
		}
	}

	// Recursively process trees in the current level
	const trees: { [path: string]: ISnapshotTreeWithBlobContents } = {};
	for (const [path, tree] of Object.entries(baseSnapshot.trees)) {
		trees[path] = combineSnapshotTreeAndSnapshotBlobs(tree, snapshotBlobs);
	}

	// Create a new snapshot tree with blob contents and processed trees
	const snapshotTreeWithBlobContents: ISnapshotTreeWithBlobContents = {
		...baseSnapshot,
		blobsContents,
		trees,
	};

	return snapshotTreeWithBlobContents;
};

export function combineSnapshotTreeAndSnapshotBlobs2(
	baseSnapshot: ISnapshotTree,
	snapshotBlobs: ISerializableBlobContents,
): ISnapshotTreeWithBlobContents {
	const blobsContents: { [path: string]: ArrayBufferLike } = {};

	if (snapshotBlobs.id) {
		blobsContents.id = stringToBuffer(snapshotBlobs.id, "utf8");
	} else {
		blobsContents.x = stringToBuffer(snapshotBlobs.id, "utf8");
	}

	// Recursively process trees in the current level
	const trees: { [path: string]: ISnapshotTreeWithBlobContents } = {};
	for (const [path, tree] of Object.entries(baseSnapshot.trees)) {
		trees[path] = combineSnapshotTreeAndSnapshotBlobs(tree, snapshotBlobs);
	}

	// Create a new snapshot tree with blob contents and processed trees
	const snapshotTreeWithBlobContents: ISnapshotTreeWithBlobContents = {
		...baseSnapshot,
		blobsContents,
		trees,
	};

	return snapshotTreeWithBlobContents;
}
