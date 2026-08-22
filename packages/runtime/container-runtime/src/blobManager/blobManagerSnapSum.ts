/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IContainerContext } from "@fluidframework/container-definitions/internal";
import { readAndParse } from "@fluidframework/driver-utils/internal";
import type { ISummaryTreeWithStats } from "@fluidframework/runtime-definitions/internal";
import { SummaryTreeBuilder } from "@fluidframework/runtime-utils/internal";
import type { TelemetryLoggerExt } from "@fluidframework/telemetry-utils/internal";

/**
 * Information from a snapshot needed to load BlobManager
 * @internal
 */
export interface IBlobManagerLoadInfo {
	ids?: string[];
	redirectTable?: [string, string][];
}

/**
 * @internal
 */
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
	const tableId: string | undefined = blobsTree.blobs[redirectTableBlobName];
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
	logger: TelemetryLoggerExt,
): Map<string, string> => {
	const count = blobManagerLoadInfo.ids?.length ?? 0;
	const redirectTableLength = blobManagerLoadInfo.redirectTable?.length ?? 0;
	if (count > 0 || redirectTableLength > 0) {
		logger.sendTelemetryEvent({
			eventName: "AttachmentBlobsLoaded",
			count,
			redirectTable: redirectTableLength,
		});
	}
	const redirectTable = new Map<string, string>(blobManagerLoadInfo.redirectTable);
	if (blobManagerLoadInfo.ids !== undefined) {
		for (const storageId of blobManagerLoadInfo.ids) {
			// Older versions of the runtime used the storage ID directly in the handle,
			// rather than routing through the redirectTable. To support old handles that
			// were created in this way but unify handling through the redirectTable, we
			// add identity mappings to the redirect table at load. These identity entries
			// will be excluded during summarization.
			redirectTable.set(storageId, storageId);
		}
	}
	return redirectTable;
};

/**
 * @internal
 */
export const embeddedBlobsTreeName = ".embeddedDetachedBlobs";

/**
 * Name of the blob within each embedded blob's own subtree that holds its raw content.
 * @internal
 */
export const embeddedBlobContentBlobName = "content";

export const summarizeBlobManagerState = (
	redirectTable: Map<string, string>,
	embeddedDetachedBlobs?: Map<string, ArrayBufferLike>,
): ISummaryTreeWithStats => summarizeV1(redirectTable, embeddedDetachedBlobs);

const summarizeV1 = (
	redirectTable: Map<string, string>,
	embeddedDetachedBlobs?: Map<string, ArrayBufferLike>,
): ISummaryTreeWithStats => {
	const builder = new SummaryTreeBuilder();
	const storageIds = getStorageIds(redirectTable);
	for (const storageId of storageIds) {
		// The Attachment is inspectable by storage, which lets it detect that the blob is referenced
		// and therefore should not be GC'd.
		builder.addAttachment(storageId);
	}

	if (embeddedDetachedBlobs !== undefined && embeddedDetachedBlobs.size > 0) {
		// Blobs created while detached with enableSingleFileCreateRoundTrip enabled: no storage ID
		// (pseudo or real) exists for these yet, so their raw bytes are embedded directly rather than as an
		// Attachment node. Each blob gets its own subtree (keyed by localId) so it can carry its own
		// groupId - this excludes the blob's content from the initial snapshot fetch (it's still fetchable
		// on demand via the loadingGroupId snapshot API, and via the regular blob read API once attached).
		// The service assigns each blob a real storage ID when it persists this summary.
		// See singleFileCreateRoundtrip.md ("Phase 1").
		const embeddedBuilder = new SummaryTreeBuilder();
		for (const [localId, blob] of embeddedDetachedBlobs) {
			const perBlobBuilder = new SummaryTreeBuilder();
			perBlobBuilder.addBlob(embeddedBlobContentBlobName, new Uint8Array(blob));
			const perBlobSummary = perBlobBuilder.getSummaryTree();
			perBlobSummary.summary.groupId = localId;
			embeddedBuilder.addWithStats(localId, perBlobSummary);
		}
		builder.addWithStats(embeddedBlobsTreeName, embeddedBuilder.getSummaryTree());
	}

	// Exclude identity mappings from the redirectTable summary. Note that
	// the storageIds of the identity mappings are still included in the Attachments
	// above, so we expect these identity mappings will be recreated at load
	// time in toRedirectTable even if there is no non-identity mapping in
	// the redirectTable.
	const nonIdentityRedirectTableEntries = [...redirectTable.entries()].filter(
		([localId, storageId]) => localId !== storageId,
	);
	if (nonIdentityRedirectTableEntries.length > 0) {
		builder.addBlob(redirectTableBlobName, JSON.stringify(nonIdentityRedirectTableEntries));
	}

	return builder.getSummaryTree();
};

export const getStorageIds = (redirectTable: Map<string, string>): Set<string> => {
	return new Set<string>(redirectTable.values());
};
