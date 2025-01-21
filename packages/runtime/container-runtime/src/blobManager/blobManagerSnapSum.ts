/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	AttachState,
	type IContainerContext,
} from "@fluidframework/container-definitions/internal";
import { assert } from "@fluidframework/core-utils/internal";
import { readAndParse } from "@fluidframework/driver-utils/internal";
import type { ISummaryTreeWithStats } from "@fluidframework/runtime-definitions/internal";
import { SummaryTreeBuilder } from "@fluidframework/runtime-utils/internal";
import type { ITelemetryLoggerExt } from "@fluidframework/telemetry-utils/internal";

/**
 * Information from a snapshot needed to load BlobManager
 * @internal
 */
export interface IBlobManagerLoadInfo {
	ids?: string[];
	redirectTable?: [string, string][];
}

export const redirectTableBlobName = ".redirectTable";

/**
 * @internal
 */
export const blobsTreeName = ".blobs";

/**
 * Reads blobs needed to load BlobManager from storage.
 *
 */
export const loadBlobManagerLoadInfo = async (
	context: Pick<IContainerContext, "baseSnapshot" | "storage" | "attachState">,
): Promise<IBlobManagerLoadInfo> => loadV1(context);

const loadV1 = async (
	context: Pick<IContainerContext, "baseSnapshot" | "storage" | "attachState">,
): Promise<IBlobManagerLoadInfo> => {
	const blobsTree = context.baseSnapshot?.trees[blobsTreeName];

	if (!blobsTree) {
		return {};
	}
	let redirectTableEntries: [string, string][] = [];
	const tableId = blobsTree.blobs[redirectTableBlobName];
	if (tableId) {
		redirectTableEntries = await readAndParse(context.storage, tableId);
	}
	const ids = Object.entries(blobsTree.blobs)
		.filter(([k, _]) => k !== redirectTableBlobName)
		.map(([_, v]) => v);

	return { ids, redirectTable: redirectTableEntries };
};

export const toRedirectTable = (
	snapshot: IBlobManagerLoadInfo,
	logger: ITelemetryLoggerExt,
	attachState: AttachState,
): Map<string, string | undefined> => {
	logger.sendTelemetryEvent({
		eventName: "AttachmentBlobsLoaded",
		count: snapshot.ids?.length ?? 0,
		redirectTable: snapshot.redirectTable?.length,
	});
	const redirectTable = new Map<string, string | undefined>(snapshot.redirectTable);
	const detached = attachState !== AttachState.Attached;
	if (snapshot.ids) {
		// If we are detached, we don't have storage IDs yet, so set to undefined
		// Otherwise, set identity (id -> id) entries.
		snapshot.ids.forEach((entry) => redirectTable.set(entry, detached ? undefined : entry));
	}
	return redirectTable;
};

export const summarizeBlobManagerState = (
	redirectTable: Map<string, string | undefined>,
	attachState: AttachState,
): ISummaryTreeWithStats => summarizeV1(redirectTable, attachState);

const summarizeV1 = (
	redirectTable: Map<string, string | undefined>,
	attachState: AttachState,
): ISummaryTreeWithStats => {
	const storageIds = getStorageIds(redirectTable, attachState);

	// if storageIds is empty, it means we are detached and have only local IDs, or that there are no blobs attached
	const blobIds =
		storageIds.size > 0 ? Array.from(storageIds) : Array.from(redirectTable.keys());
	const builder = new SummaryTreeBuilder();
	blobIds.forEach((blobId) => {
		builder.addAttachment(blobId);
	});

	// Any non-identity entries in the table need to be saved in the summary
	if (redirectTable.size > blobIds.length) {
		builder.addBlob(
			redirectTableBlobName,
			// filter out identity entries
			JSON.stringify(
				Array.from(redirectTable.entries()).filter(
					([localId, storageId]) => localId !== storageId,
				),
			),
		);
	}

	return builder.getSummaryTree();
};

export const getStorageIds = (
	redirectTable: Map<string, string | undefined>,
	attachState: AttachState,
): Set<string> => {
	const ids = new Set<string | undefined>(redirectTable.values());

	// If we are detached, we will not have storage IDs, only undefined
	const undefinedValueInTable = ids.delete(undefined);

	// For a detached container, entries are inserted into the redirect table with an undefined storage ID.
	// For an attached container, entries are inserted w/storage ID after the BlobAttach op round-trips.
	assert(
		!undefinedValueInTable || (attachState === AttachState.Detached && ids.size === 0),
		0x382 /* 'redirectTable' must contain only undefined while detached / defined values while attached */,
	);

	return ids as Set<string>;
};
