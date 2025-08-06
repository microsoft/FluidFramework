/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type IContainerContext } from "@fluidframework/container-definitions/internal";
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
	blobManagerLoadInfo: IBlobManagerLoadInfo,
	logger: ITelemetryLoggerExt,
): Map<string, string> => {
	logger.sendTelemetryEvent({
		eventName: "AttachmentBlobsLoaded",
		count: blobManagerLoadInfo.ids?.length ?? 0,
		redirectTable: blobManagerLoadInfo.redirectTable?.length,
	});
	return new Map<string, string>(blobManagerLoadInfo.redirectTable);
};

export const summarizeBlobManagerState = (
	redirectTable: Map<string, string>,
): ISummaryTreeWithStats => summarizeV1(redirectTable);

const summarizeV1 = (redirectTable: Map<string, string>): ISummaryTreeWithStats => {
	const builder = new SummaryTreeBuilder();
	const storageIds = getStorageIds(redirectTable);
	for (const storageId of storageIds) {
		// The attachment is inspectable by storage, which lets it detect that the blob is referenced
		// and therefore should not be GC'd.
		builder.addAttachment(storageId);
	}
	if (redirectTable.size > 0) {
		builder.addBlob(redirectTableBlobName, JSON.stringify([...redirectTable.entries()]));
	}

	return builder.getSummaryTree();
};

export const getStorageIds = (redirectTable: Map<string, string>): Set<string> => {
	return new Set<string>(redirectTable.values());
};
