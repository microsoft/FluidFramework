/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	AttachState,
	type IContainerContext,
	type ISnapshotTreeWithBlobContents,
} from "@fluidframework/container-definitions/internal";
import { assert } from "@fluidframework/core-utils/internal";
import { SummaryType } from "@fluidframework/driver-definitions";
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
	 * The summary subtree containing blobs created while detached.
	 * `blobs` maps stable local IDs to the current snapshot blob IDs.
	 * `blobsContents` is populated only while rehydrating a detached container.
	 */
	embeddedDetachedBlobs?: ISnapshotTreeWithBlobContents;
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
	context: Pick<IContainerContext, "baseSnapshot" | "attachState" | "snapshotWithContents"> & {
		storage: Pick<IContainerContext["storage"], "readBlob">;
	},
): Promise<IBlobManagerLoadInfo> => loadV1(context);

const loadV1 = async (
	context: Pick<IContainerContext, "baseSnapshot" | "attachState" | "snapshotWithContents"> & {
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
		.filter(([k, _]) => k !== redirectTableBlobName)
		.map(([_, v]) => v);

	const embeddedBlobsTree: ISnapshotTree | undefined = blobsTree.trees[embeddedBlobsTreeName];
	let embeddedDetachedBlobs: ISnapshotTreeWithBlobContents | undefined;
	if (embeddedBlobsTree !== undefined) {
		assert(
			Object.keys(embeddedBlobsTree.trees).length === 0,
			"Embedded detached blobs summary cannot contain child trees",
		);
		const { blobsContents: existingBlobContents, ...treeWithoutContents } =
			embeddedBlobsTree as ISnapshotTreeWithBlobContents;
		const blobsContents: Record<string, ArrayBufferLike> | undefined =
			context.attachState === AttachState.Detached ? { ...existingBlobContents } : undefined;
		if (blobsContents !== undefined) {
			const loadedBlobContents = await Promise.all(
				Object.values(embeddedBlobsTree.blobs).map(async (blobId) => {
					if (blobsContents[blobId] !== undefined) {
						return undefined;
					}
					const content =
						context.snapshotWithContents?.blobContents.get(blobId) ??
						(await context.storage.readBlob(blobId));
					return [blobId, content] as const;
				}),
			);
			for (const loadedBlobContent of loadedBlobContents) {
				if (loadedBlobContent !== undefined) {
					blobsContents[loadedBlobContent[0]] = loadedBlobContent[1];
				}
			}
		}
		embeddedDetachedBlobs = {
			...treeWithoutContents,
			trees: {},
			...(blobsContents === undefined ? {} : { blobsContents }),
		};
	}

	return { ids, redirectTable: redirectTableEntries, embeddedDetachedBlobs };
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
 * The shared groupId assigned to the embedded-blobs subtree.
 * @internal
 */
export const embeddedBlobsGroupId = "embeddedDetachedBlobs";

export const summarizeBlobManagerState = (
	redirectTable: Map<string, string>,
	embeddedDetachedBlobContents?: ReadonlyMap<string, ArrayBufferLike>,
	embeddedDetachedBlobLocalIds?: ReadonlySet<string>,
): ISummaryTreeWithStats =>
	summarizeV1(redirectTable, embeddedDetachedBlobContents, embeddedDetachedBlobLocalIds);

const summarizeV1 = (
	redirectTable: Map<string, string>,
	embeddedDetachedBlobContents?: ReadonlyMap<string, ArrayBufferLike>,
	embeddedDetachedBlobLocalIds?: ReadonlySet<string>,
): ISummaryTreeWithStats => {
	const builder = new SummaryTreeBuilder();
	const storageIds = getStorageIds(redirectTable);
	const embeddedDetachedBlobStorageIds = new Set<string>();
	const embeddedBuilder = new SummaryTreeBuilder({ groupId: embeddedBlobsGroupId });
	for (const localId of new Set([
		...(embeddedDetachedBlobContents?.keys() ?? []),
		...(embeddedDetachedBlobLocalIds ?? []),
	])) {
		const storageId = redirectTable.get(localId);
		if (storageId !== undefined) {
			embeddedDetachedBlobStorageIds.add(storageId);
		}
		const content = embeddedDetachedBlobContents?.get(localId);
		if (content === undefined) {
			embeddedBuilder.addHandle(
				localId,
				SummaryType.Blob,
				`/${blobsTreeName}/${embeddedBlobsTreeName}/${localId}`,
			);
		} else {
			embeddedBuilder.addBlob(localId, new Uint8Array(content));
		}
	}
	const embeddedSummary = embeddedBuilder.getSummaryTree();
	const hasEmbeddedDetachedBlobs = Object.keys(embeddedSummary.summary.tree).length > 0;
	if (hasEmbeddedDetachedBlobs) {
		builder.addWithStats(embeddedBlobsTreeName, embeddedSummary);
	}
	for (const storageId of storageIds) {
		if (!embeddedDetachedBlobStorageIds.has(storageId)) {
			// The Attachment is inspectable by storage, which lets it detect that the blob is referenced
			// and therefore should not be GC'd.
			builder.addAttachment(storageId);
		}
	}

	// Exclude identity mappings from the redirectTable summary. Note that
	// the storageIds of the identity mappings are still included in the Attachments
	// above, so we expect these identity mappings will be recreated at load
	// time in toRedirectTable even if there is no non-identity mapping in
	// the redirectTable.
	const nonIdentityRedirectTableEntries = [...redirectTable.entries()].filter(
		([localId, storageId]) =>
			localId !== storageId && embeddedDetachedBlobLocalIds?.has(localId) !== true,
	);
	if (nonIdentityRedirectTableEntries.length > 0 || hasEmbeddedDetachedBlobs) {
		builder.addBlob(redirectTableBlobName, JSON.stringify(nonIdentityRedirectTableEntries));
	}

	return builder.getSummaryTree();
};

export const getStorageIds = (redirectTable: Map<string, string>): Set<string> => {
	return new Set<string>(redirectTable.values());
};
