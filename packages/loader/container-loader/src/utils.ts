/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { parse } from "url";
import { v4 as uuid } from "uuid";
import { Uint8ArrayToString, stringToBuffer } from "@fluid-internal/client-utils";
import { assert, unreachableCase } from "@fluidframework/core-utils";
import { ISummaryTree, ISnapshotTree, SummaryType } from "@fluidframework/protocol-definitions";
import { LoggingError, UsageError } from "@fluidframework/telemetry-utils";
import {
	CombinedAppAndProtocolSummary,
	DeltaStreamConnectionForbiddenError,
	isCombinedAppAndProtocolSummary,
} from "@fluidframework/driver-utils";
import { DriverErrorTypes } from "@fluidframework/driver-definitions";
import { ISerializableBlobContents } from "./containerStorageAdapter";
import { IPendingDetachedContainerState } from "./container";

// This is used when we rehydrate a container from the snapshot. Here we put the blob contents
// in separate property: blobContents.
export interface ISnapshotTreeWithBlobContents extends ISnapshotTree {
	blobsContents: { [path: string]: ArrayBufferLike };
	trees: { [path: string]: ISnapshotTreeWithBlobContents };
}

/**
 * Interface to represent the parsed parts of IResolvedUrl.url to help
 * in getting info about different parts of the url.
 * May not be compatible or relevant for any Url Resolver
 * @internal
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
	 * Null means do not use snapshots, undefined means load latest snapshot
	 * otherwise it's version ID passed to IDocumentStorageService.getVersions() to figure out what snapshot to use.
	 * If needed, can add undefined which is treated by Container.load() as load latest snapshot.
	 */
	version: string | null | undefined;
}

/**
 * Utility api to parse the IResolvedUrl.url into specific parts like querystring, path to get
 * deep link info etc.
 * Warning - This function may not be compatible with any Url Resolver's resolved url. It works
 * with urls of type: protocol://<string>/.../..?<querystring>
 * @param url - This is the IResolvedUrl.url part of the resolved url.
 * @returns The IParsedUrl representing the input URL, or undefined if the format was not supported
 * @internal
 */
export function tryParseCompatibleResolvedUrl(url: string): IParsedUrl | undefined {
	const parsed = parse(url, true);
	if (typeof parsed.pathname !== "string") {
		throw new LoggingError("Failed to parse pathname");
	}
	const query = parsed.search ?? "";
	const regex = /^\/([^/]*\/[^/]*)(\/?.*)$/;
	const match = regex.exec(parsed.pathname);
	return match?.length === 3
		? { id: match[1], path: match[2], query, version: parsed.query.version as string }
		: undefined;
}

/**
 * Combine the app summary and protocol summary in 1 tree.
 * @param appSummary - Summary of the app.
 * @param protocolSummary - Summary of the protocol.
 * @internal
 */
export function combineAppAndProtocolSummary(
	appSummary: ISummaryTree,
	protocolSummary: ISummaryTree,
): CombinedAppAndProtocolSummary {
	assert(
		!isCombinedAppAndProtocolSummary(appSummary),
		0x5a8 /* app summary is already a combined tree! */,
	);
	assert(
		!isCombinedAppAndProtocolSummary(protocolSummary),
		0x5a9 /* protocol summary is already a combined tree! */,
	);
	const createNewSummary: CombinedAppAndProtocolSummary = {
		type: SummaryType.Tree,
		tree: {
			".protocol": protocolSummary,
			".app": appSummary,
		},
	};
	return createNewSummary;
}

/**
 * Converts a summary to snapshot tree and separate its blob contents
 * to align detached container format with IPendingContainerState
 * @param summary - ISummaryTree
 */
function convertSummaryToSnapshotAndBlobs(
	summary: ISummaryTree,
): [ISnapshotTree, ISerializableBlobContents] {
	let blobContents: ISerializableBlobContents = {};
	const treeNode: ISnapshotTree = {
		blobs: {},
		trees: {},
		id: uuid(),
		unreferenced: summary.unreferenced,
	};
	const keys = Object.keys(summary.tree);
	for (const key of keys) {
		const summaryObject = summary.tree[key];

		switch (summaryObject.type) {
			case SummaryType.Tree: {
				let blobs: ISerializableBlobContents | undefined;
				[treeNode.trees[key], blobs] = convertSummaryToSnapshotAndBlobs(summaryObject);
				blobContents = { ...blobContents, ...blobs };
				break;
			}
			case SummaryType.Attachment:
				treeNode.blobs[key] = summaryObject.id;
				break;
			case SummaryType.Blob: {
				const blobId = uuid();
				treeNode.blobs[key] = blobId;
				const contentString: string =
					summaryObject.content instanceof Uint8Array
						? Uint8ArrayToString(summaryObject.content)
						: summaryObject.content;
				blobContents[blobId] = contentString;
				break;
			}
			case SummaryType.Handle:
				throw new LoggingError(
					"No handles should be there in summary in detached container!!",
				);
				break;
			default: {
				unreachableCase(summaryObject, `Unknown tree type ${(summaryObject as any).type}`);
			}
		}
	}
	return [treeNode, blobContents];
}

/**
 * Converts summary parts into a SnapshotTree and its blob contents.
 * @param protocolSummaryTree - Protocol Summary Tree
 * @param appSummaryTree - App Summary Tree
 */
function convertProtocolAndAppSummaryToSnapshotAndBlobs(
	protocolSummaryTree: ISummaryTree,
	appSummaryTree: ISummaryTree,
): [ISnapshotTree, ISerializableBlobContents] {
	const combinedSummary: ISummaryTree = {
		type: SummaryType.Tree,
		tree: { ...appSummaryTree.tree },
	};

	combinedSummary.tree[".protocol"] = protocolSummaryTree;
	const snapshotTreeWithBlobContents = convertSummaryToSnapshotAndBlobs(combinedSummary);
	return snapshotTreeWithBlobContents;
}

export const getSnapshotTreeAndBlobsFromSerializedContainer = (
	detachedContainerSnapshot: ISummaryTree,
): [ISnapshotTree, ISerializableBlobContents] => {
	assert(
		isCombinedAppAndProtocolSummary(detachedContainerSnapshot),
		"Protocol and App summary trees should be present",
	);
	const protocolSummaryTree = detachedContainerSnapshot.tree[".protocol"];
	const appSummaryTree = detachedContainerSnapshot.tree[".app"];
	const snapshotTreeWithBlobContents = convertProtocolAndAppSummaryToSnapshotAndBlobs(
		protocolSummaryTree,
		appSummaryTree,
	);
	return snapshotTreeWithBlobContents;
};

export function getProtocolSnapshotTree(snapshot: ISnapshotTree): ISnapshotTree {
	return ".protocol" in snapshot.trees ? snapshot.trees[".protocol"] : snapshot;
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

export function isDeltaStreamConnectionForbiddenError(
	error: any,
): error is DeltaStreamConnectionForbiddenError {
	return (
		typeof error === "object" &&
		error !== null &&
		error?.errorType === DriverErrorTypes.deltaStreamConnectionForbidden
	);
}

/**
 * Validates format in parsed string get from detached container
 * serialization using IPendingDetachedContainerState format.
 */
function isPendingDetachedContainerState(
	detachedContainerState: IPendingDetachedContainerState,
): detachedContainerState is IPendingDetachedContainerState {
	if (
		detachedContainerState?.attached === undefined ||
		detachedContainerState?.baseSnapshot === undefined ||
		detachedContainerState?.snapshotBlobs === undefined ||
		detachedContainerState?.hasAttachmentBlobs === undefined
	) {
		return false;
	}
	return true;
}

export function getDetachedContainerStateFromSerializedContainer(
	serializedContainer: string,
): IPendingDetachedContainerState {
	const hasBlobsSummaryTree = ".hasAttachmentBlobs";
	const parsedContainerState = JSON.parse(serializedContainer);
	if (isPendingDetachedContainerState(parsedContainerState)) {
		return parsedContainerState;
	} else if (isCombinedAppAndProtocolSummary(parsedContainerState)) {
		const [baseSnapshot, snapshotBlobs] =
			getSnapshotTreeAndBlobsFromSerializedContainer(parsedContainerState);
		const detachedContainerState: IPendingDetachedContainerState = {
			attached: false,
			baseSnapshot,
			snapshotBlobs,
			hasAttachmentBlobs: parsedContainerState.tree[hasBlobsSummaryTree] !== undefined,
		};
		return detachedContainerState;
	} else {
		throw new UsageError("Cannot rehydrate detached container. Incorrect format");
	}
}
