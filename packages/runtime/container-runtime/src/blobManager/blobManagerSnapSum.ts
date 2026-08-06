/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AttachState } from "@fluidframework/container-definitions";
import type { IContainerContext } from "@fluidframework/container-definitions/internal";
import { assert } from "@fluidframework/core-utils/internal";
import type { ISnapshotTree } from "@fluidframework/driver-definitions/internal";
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
	/**
	 * Detached attachment blobs represented as summary blobs, keyed by their
	 * detached storage IDs.
	 */
	summaryBlobs?: Map<string, ArrayBufferLike>;
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
 * Name of the blob entry inside an inlined attachment blob's loading-group tree.
 * @internal
 */
export const inlinedAttachmentBlobContentName = "content";

/**
 * Prefix used to identify the internal loading group for an inlined attachment blob.
 * @internal
 */
export const inlinedAttachmentBlobGroupIdPrefix = "fluid-internal:attachment-blob:";

/**
 * Root-level manifest mapping inlined blob tree names to detached storage IDs.
 * @internal
 */
export const inlinedAttachmentBlobManifestName = ".inlinedAttachmentBlobs";

/**
 * Reads blobs needed to load BlobManager from storage.
 *
 */
export const loadBlobManagerLoadInfo = async (
	context: Pick<
		IContainerContext,
		"baseSnapshot" | "attachState" | "pendingLocalState" | "snapshotWithContents"
	> & {
		storage: Pick<IContainerContext["storage"], "readBlob">;
	},
): Promise<IBlobManagerLoadInfo> => loadV1(context);

const loadV1 = async (
	context: Pick<
		IContainerContext,
		"baseSnapshot" | "attachState" | "pendingLocalState" | "snapshotWithContents"
	> & {
		storage: Pick<IContainerContext["storage"], "readBlob">;
	},
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
		.filter(([k, _]) => k !== redirectTableBlobName && k !== inlinedAttachmentBlobManifestName)
		.map(([_, v]) => v);

	const inlinedBlobIds = new Map<string, string>();
	const manifestId: string | undefined = blobsTree.blobs[inlinedAttachmentBlobManifestName];
	if (manifestId === undefined) {
		for (const childTree of Object.values(blobsTree.trees)) {
			const { groupId } = childTree;
			if (groupId?.startsWith(inlinedAttachmentBlobGroupIdPrefix) !== true) {
				continue;
			}
			const detachedStorageId = groupId.slice(inlinedAttachmentBlobGroupIdPrefix.length);
			const blobId: string | undefined = childTree.blobs[inlinedAttachmentBlobContentName];
			assert(blobId !== undefined, "Inlined attachment blob tree must contain content");
			inlinedBlobIds.set(detachedStorageId, blobId);
		}
	} else {
		const manifest = await readAndParse<[string, string][]>(context.storage, manifestId);
		for (const [treeName, detachedStorageId] of manifest) {
			const childTree: ISnapshotTree | undefined = blobsTree.trees[treeName];
			assert(childTree !== undefined, "Inlined attachment blob tree must be present");
			const blobId: string | undefined = childTree.blobs[inlinedAttachmentBlobContentName];
			assert(blobId !== undefined, "Inlined attachment blob tree must contain content");
			inlinedBlobIds.set(detachedStorageId, blobId);
		}
	}

	if (
		context.attachState === AttachState.Detached ||
		context.pendingLocalState !== undefined ||
		[...inlinedBlobIds.values()].some(
			(blobId) => context.snapshotWithContents?.blobContents.has(blobId) === true,
		)
	) {
		const summaryBlobs = new Map<string, ArrayBufferLike>();
		await Promise.all(
			[...inlinedBlobIds].map(async ([detachedStorageId, blobId]) => {
				summaryBlobs.set(
					detachedStorageId,
					context.snapshotWithContents?.blobContents.get(blobId) ??
						(await context.storage.readBlob(blobId)),
				);
			}),
		);
		return { ids, redirectTable: redirectTableEntries, summaryBlobs };
	}

	redirectTableEntries = redirectTableEntries.map(([localId, storageId]) => [
		localId,
		inlinedBlobIds.get(storageId) ?? storageId,
	]);
	ids.push(...inlinedBlobIds.values());
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

export const summarizeBlobManagerState = (
	redirectTable: Map<string, string>,
	summaryBlobs?: ReadonlyMap<string, ArrayBufferLike>,
): ISummaryTreeWithStats => summarizeV1(redirectTable, summaryBlobs);

const summarizeV1 = (
	redirectTable: Map<string, string>,
	summaryBlobs?: ReadonlyMap<string, ArrayBufferLike>,
): ISummaryTreeWithStats => {
	const builder = new SummaryTreeBuilder();
	const storageIds = getStorageIds(redirectTable);
	const manifest: [string, string][] = [];
	let summaryBlobIndex = 0;
	for (const storageId of storageIds) {
		const summaryBlob = summaryBlobs?.get(storageId);
		if (summaryBlob === undefined) {
			// The Attachment is inspectable by storage, which lets it detect that the blob is referenced
			// and therefore should not be GC'd.
			builder.addAttachment(storageId);
		} else {
			const treeName = `.inline_${summaryBlobIndex++}`;
			const blobBuilder = new SummaryTreeBuilder({
				groupId: `${inlinedAttachmentBlobGroupIdPrefix}${storageId}`,
			});
			blobBuilder.addBlob(inlinedAttachmentBlobContentName, new Uint8Array(summaryBlob));
			builder.addWithStats(treeName, blobBuilder.getSummaryTree());
			manifest.push([treeName, storageId]);
		}
	}
	if (manifest.length > 0) {
		builder.addBlob(inlinedAttachmentBlobManifestName, JSON.stringify(manifest));
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
