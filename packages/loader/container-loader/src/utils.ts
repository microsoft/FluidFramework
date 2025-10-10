/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	bufferToString,
	stringToBuffer,
	Uint8ArrayToArrayBuffer,
} from "@fluid-internal/client-utils";
import { assert, compareArrays, unreachableCase } from "@fluidframework/core-utils/internal";
import { type ISummaryTree, SummaryType } from "@fluidframework/driver-definitions";
import {
	DriverErrorTypes,
	type IDocumentAttributes,
	type ISnapshotTree,
	type IDocumentStorageService,
	type ISnapshot,
} from "@fluidframework/driver-definitions/internal";
import {
	type CombinedAppAndProtocolSummary,
	type DeltaStreamConnectionForbiddenError,
	isCombinedAppAndProtocolSummary,
	readAndParse,
} from "@fluidframework/driver-utils/internal";
import {
	LoggingError,
	UsageError,
	type IFluidErrorBase,
} from "@fluidframework/telemetry-utils/internal";
import { v4 as uuid } from "uuid";

import type { ISerializableBlobContents } from "./containerStorageAdapter.js";
import type {
	IPendingContainerState,
	IPendingDetachedContainerState,
	SerializedSnapshotInfo,
	SnapshotWithBlobs,
} from "./serializedStateManager.js";

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
 * @legacy @beta
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

/**
 * Utility api to parse the IResolvedUrl.url into specific parts like querystring, path to get
 * deep link info etc.
 * Warning - This function may not be compatible with any Url Resolver's resolved url. It works
 * with urls of type: protocol://<string>/.../..?<querystring>
 * @param url - This is the IResolvedUrl.url part of the resolved url.
 * @returns The IParsedUrl representing the input URL, or undefined if the format was not supported
 * @legacy @beta
 */
export function tryParseCompatibleResolvedUrl(url: string): IParsedUrl | undefined {
	const parsed = new URL(url);
	if (typeof parsed.pathname !== "string") {
		throw new LoggingError("Failed to parse pathname");
	}
	const query = parsed.search ?? "";
	const regex = /^\/([^/]*\/[^/]*)(\/?.*)$/;
	const match = regex.exec(parsed.pathname);
	return match?.length === 3
		? {
				id: match[1],
				path: match[2],
				query,
				// URLSearchParams returns null if the param is not provided.
				version: parsed.searchParams.get("version") ?? undefined,
			}
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
function convertSummaryToISnapshot(
	summary: ISummaryTree,
	blobContents = new Map<string, ArrayBuffer>(),
): ISnapshot {
	const snapshotTree: ISnapshotTree = {
		blobs: {},
		trees: {},
		id: uuid(),
		unreferenced: summary.unreferenced,
		groupId: summary.groupId,
	};

	for (const [key, summaryObject] of Object.entries(summary.tree)) {
		switch (summaryObject.type) {
			case SummaryType.Tree: {
				const innerSnapshot = convertSummaryToISnapshot(summaryObject, blobContents);
				snapshotTree.trees[key] = innerSnapshot.snapshotTree;
				break;
			}
			case SummaryType.Attachment: {
				snapshotTree.blobs[key] = summaryObject.id;
				break;
			}
			case SummaryType.Blob: {
				const blobId = uuid();
				snapshotTree.blobs[key] = blobId;
				blobContents.set(
					blobId,
					summaryObject.content instanceof Uint8Array
						? Uint8ArrayToArrayBuffer(summaryObject.content)
						: stringToBuffer(summaryObject.content, "utf8"),
				);

				break;
			}
			case SummaryType.Handle: {
				throw new LoggingError(
					"No handles should be there in summary in detached container!!",
				);
			}
			default: {
				// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
				unreachableCase(summaryObject, `Unknown tree type ${(summaryObject as any).type}`);
			}
		}
	}
	return {
		blobContents,
		latestSequenceNumber: undefined,
		ops: [],
		sequenceNumber: 0,
		snapshotFormatV: 1,
		snapshotTree,
	};
}

/**
 * Converts a snapshot to snapshotInfo with its blob contents
 * to align detached container format with IPendingContainerState
 *
 * Note, this assumes the ISnapshot sequence number is defined. Otherwise an assert will be thrown
 * @param snapshot - ISnapshot
 */
export function convertSnapshotToSnapshotInfo(snapshot: ISnapshot): SerializedSnapshotInfo {
	assert(
		snapshot.sequenceNumber !== undefined,
		0x93a /* Snapshot sequence number is missing */,
	);
	const snapshotBlobs: ISerializableBlobContents = {};
	for (const [blobId, arrayBufferLike] of snapshot.blobContents.entries()) {
		snapshotBlobs[blobId] = bufferToString(arrayBufferLike, "utf8");
	}
	return {
		baseSnapshot: snapshot.snapshotTree,
		snapshotBlobs,
		snapshotSequenceNumber: snapshot.sequenceNumber,
	};
}

/**
 * Converts a snapshot to snapshotInfo with its blob contents
 * to align detached container format with IPendingContainerState
 *
 * Note, this assumes the ISnapshot sequence number is defined. Otherwise an assert will be thrown
 * @param snapshot - ISnapshot
 */
export function convertSnapshotInfoToSnapshot(
	snapshotInfo: SerializedSnapshotInfo,
): ISnapshot {
	const blobContents = new Map<string, ArrayBuffer>();
	for (const [blobId, serializedContent] of Object.entries(snapshotInfo.snapshotBlobs)) {
		blobContents.set(blobId, stringToBuffer(serializedContent, "utf8"));
	}
	return {
		snapshotTree: snapshotInfo.baseSnapshot,
		blobContents,
		ops: [],
		sequenceNumber: snapshotInfo.snapshotSequenceNumber,
		latestSequenceNumber: undefined,
		snapshotFormatV: 1,
	};
}

/**
 * Converts summary parts into a SnapshotTree and its blob contents.
 * @param protocolSummaryTree - Protocol Summary Tree
 * @param appSummaryTree - App Summary Tree
 */
function convertProtocolAndAppSummaryToISnapshot(
	protocolSummaryTree: ISummaryTree,
	appSummaryTree: ISummaryTree,
): ISnapshot {
	const combinedSummary: ISummaryTree = {
		type: SummaryType.Tree,
		tree: { ...appSummaryTree.tree },
	};

	combinedSummary.tree[".protocol"] = protocolSummaryTree;
	const snapshotTreeWithBlobContents = convertSummaryToISnapshot(combinedSummary);
	return snapshotTreeWithBlobContents;
}

export const getISnapshotFromSerializedContainer = (
	detachedContainerSnapshot: ISummaryTree,
): ISnapshot => {
	assert(
		isCombinedAppAndProtocolSummary(detachedContainerSnapshot),
		0x8e6 /* Protocol and App summary trees should be present */,
	);
	const protocolSummaryTree = detachedContainerSnapshot.tree[".protocol"];
	const appSummaryTree = detachedContainerSnapshot.tree[".app"];
	const snapshotTreeWithBlobContents = convertProtocolAndAppSummaryToISnapshot(
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
		if (snapshotBlobs[id] !== undefined) {
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
	error: unknown,
): error is DeltaStreamConnectionForbiddenError {
	return (
		typeof error === "object" &&
		error !== null &&
		(error as Partial<IFluidErrorBase>)?.errorType ===
			DriverErrorTypes.deltaStreamConnectionForbidden
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
/**
 * Converts an ISnapshot to a SnapshotWithBlobs, extracting and serializing its blob contents.
 * @param snapshot - The ISnapshot to convert.
 * @returns A SnapshotWithBlobs containing the base snapshot and serialized blob contents.
 */
export function convertISnapshotToSnapshotWithBlobs(snapshot: ISnapshot): SnapshotWithBlobs {
	const snapshotBlobs: ISerializableBlobContents = {};
	for (const [id, blob] of snapshot.blobContents.entries()) {
		snapshotBlobs[id] = bufferToString(blob, "utf8");
	}
	return {
		baseSnapshot: snapshot.snapshotTree,
		snapshotBlobs,
	};
}

/**
 * Parses the given string into {@link IPendingDetachedContainerState} format,
 * with validation (if invalid, throws a UsageError).
 * This is the inverse of the JSON.stringify call in {@link Container.serialize}
 */
export function getDetachedContainerStateFromSerializedContainer(
	serializedContainer: string,
): IPendingDetachedContainerState {
	const hasBlobsSummaryTree = ".hasAttachmentBlobs";
	// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
	const parsedContainerState = JSON.parse(serializedContainer);
	// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
	if (isPendingDetachedContainerState(parsedContainerState)) {
		return parsedContainerState;
		// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
	} else if (isCombinedAppAndProtocolSummary(parsedContainerState)) {
		const snapshot = getISnapshotFromSerializedContainer(parsedContainerState);
		const detachedContainerState: IPendingDetachedContainerState = {
			attached: false,
			...convertISnapshotToSnapshotWithBlobs(snapshot),
			hasAttachmentBlobs: parsedContainerState.tree[hasBlobsSummaryTree] !== undefined,
		};
		return detachedContainerState;
	} else {
		throw new UsageError("Cannot rehydrate detached container. Incorrect format");
	}
}

/**
 * Blindly parses the given string into {@link IPendingContainerState} format.
 * This is the inverse of the JSON.stringify call in {@link SerializedStateManager.getPendingLocalState}
 */
export function getAttachedContainerStateFromSerializedContainer(
	serializedContainer: string | undefined,
): IPendingContainerState | undefined {
	return serializedContainer === undefined
		? undefined
		: (JSON.parse(serializedContainer) as IPendingContainerState);
}

/**
 * Ensures only a single instance of the provided async function is running.
 * If there are multiple calls they will all get the same promise to wait on.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const runSingle = <A extends any[], R>(
	func: (...args: A) => Promise<R>,
): ((...args: A) => Promise<R>) => {
	let running:
		| {
				args: A;
				result: Promise<R>;
		  }
		| undefined;
	// don't mark this function async, so we return the same promise,
	// rather than one that is wrapped due to async
	// eslint-disable-next-line @typescript-eslint/promise-function-async
	return (...args: A): Promise<R> => {
		if (running !== undefined) {
			if (!compareArrays(running.args, args)) {
				return Promise.reject(
					new UsageError("Subsequent calls cannot use different arguments."),
				);
			}
			return running.result;
		}
		running = { args, result: func(...args).finally(() => (running = undefined)) };
		return running.result;
	};
};

export async function getDocumentAttributes(
	storage: Pick<IDocumentStorageService, "readBlob">,
	tree: ISnapshotTree | undefined,
): Promise<IDocumentAttributes> {
	if (tree === undefined) {
		return {
			minimumSequenceNumber: 0,
			sequenceNumber: 0,
		};
	}

	// Backward compatibility: old docs would have ".attributes" instead of "attributes"
	const attributesHash =
		".protocol" in tree.trees
			? tree.trees[".protocol"].blobs.attributes
			: tree.blobs[".attributes"];

	const attributes = await readAndParse<IDocumentAttributes>(storage, attributesHash);

	return attributes;
}
