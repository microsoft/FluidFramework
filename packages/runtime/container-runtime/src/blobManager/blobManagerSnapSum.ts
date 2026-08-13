/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AttachState } from "@fluidframework/container-definitions";
import type { IContainerContext } from "@fluidframework/container-definitions/internal";
import { bufferToString, stringToBuffer } from "@fluid-internal/client-utils";
import { SummaryType } from "@fluidframework/driver-definitions";
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
	 * local IDs. Only populated when rehydrating a detached container.
	 */
	detachedBlobSummaryContents?: Map<string, ArrayBufferLike>;
	/**
	 * Local IDs whose payload can be referenced by handle from an attached container's
	 * previous summary.
	 */
	detachedBlobSummaryHandles?: Set<string>;
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
 * Tree containing blobs created while the container was detached.
 * @internal
 */
export const detachedBlobSummaryTreeName = ".detached";

/**
 * Loading group for blobs created while the container was detached.
 * @internal
 */
export const detachedBlobSummaryGroupId = "fluid-internal:detached-blobs";

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

	const detachedBlobSummaryIds = new Map(
		Object.entries(blobsTree.trees[detachedBlobSummaryTreeName]?.blobs ?? {}),
	);

	if (context.attachState === AttachState.Detached) {
		const detachedBlobSummaryContents = new Map<string, ArrayBufferLike>();
		await Promise.all(
			[...detachedBlobSummaryIds].map(async ([localId, blobId]) => {
				detachedBlobSummaryContents.set(
					localId,
					stringToBuffer(
						bufferToString(
							context.snapshotWithContents?.blobContents.get(blobId) ??
								(await context.storage.readBlob(blobId)),
							"utf8",
						),
						"base64",
					),
				);
			}),
		);
		redirectTableEntries.push(
			...[...detachedBlobSummaryIds.keys()].map(
				(localId) => [localId, localId] as [string, string],
			),
		);
		return {
			ids,
			redirectTable: redirectTableEntries,
			detachedBlobSummaryContents:
				detachedBlobSummaryContents.size === 0 ? undefined : detachedBlobSummaryContents,
		};
	}

	const detachedBlobSummaryHandles = new Set<string>();
	for (const [localId, blobId] of detachedBlobSummaryIds) {
		redirectTableEntries.push([localId, blobId]);
		ids.push(blobId);
		detachedBlobSummaryHandles.add(localId);
	}
	return {
		ids,
		redirectTable: redirectTableEntries,
		detachedBlobSummaryHandles:
			detachedBlobSummaryHandles.size === 0 ? undefined : detachedBlobSummaryHandles,
	};
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
	detachedBlobSummaryContents?: ReadonlyMap<string, ArrayBufferLike>,
	detachedBlobSummaryHandles?: ReadonlySet<string>,
): ISummaryTreeWithStats =>
	summarizeV1(redirectTable, detachedBlobSummaryContents, detachedBlobSummaryHandles);

const summarizeV1 = (
	redirectTable: Map<string, string>,
	detachedBlobSummaryContents?: ReadonlyMap<string, ArrayBufferLike>,
	detachedBlobSummaryHandles?: ReadonlySet<string>,
): ISummaryTreeWithStats => {
	const builder = new SummaryTreeBuilder();
	const storageIds = getStorageIds(redirectTable);
	const detachedBlobSummaryStorageIds = new Set<string>();
	const detachedBlobSummaryBuilder = new SummaryTreeBuilder({
		groupId: detachedBlobSummaryGroupId,
	});
	for (const localId of new Set([
		...(detachedBlobSummaryContents?.keys() ?? []),
		...(detachedBlobSummaryHandles ?? []),
	])) {
		const storageId = redirectTable.get(localId);
		if (storageId !== undefined) {
			detachedBlobSummaryStorageIds.add(storageId);
		}
		const detachedBlobSummaryContent = detachedBlobSummaryContents?.get(localId);
		if (detachedBlobSummaryContent === undefined) {
			detachedBlobSummaryBuilder.addHandle(
				localId,
				SummaryType.Blob,
				`/${blobsTreeName}/${detachedBlobSummaryTreeName}/${localId}`,
			);
		} else {
			detachedBlobSummaryBuilder.addBlob(
				localId,
				bufferToString(detachedBlobSummaryContent, "base64"),
			);
		}
	}
	const detachedBlobSummary = detachedBlobSummaryBuilder.getSummaryTree();
	if (Object.keys(detachedBlobSummary.summary.tree).length > 0) {
		builder.addWithStats(detachedBlobSummaryTreeName, detachedBlobSummary);
	}
	for (const storageId of storageIds) {
		if (!detachedBlobSummaryStorageIds.has(storageId)) {
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
			localId !== storageId &&
			detachedBlobSummaryContents?.has(localId) !== true &&
			detachedBlobSummaryHandles?.has(localId) !== true,
	);
	if (nonIdentityRedirectTableEntries.length > 0) {
		builder.addBlob(redirectTableBlobName, JSON.stringify(nonIdentityRedirectTableEntries));
	}

	return builder.getSummaryTree();
};

export const getStorageIds = (redirectTable: Map<string, string>): Set<string> => {
	return new Set<string>(redirectTable.values());
};
