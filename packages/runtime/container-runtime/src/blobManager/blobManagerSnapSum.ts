/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AttachState } from "@fluidframework/container-definitions";
import type { IContainerContext } from "@fluidframework/container-definitions/internal";
import { assert } from "@fluidframework/core-utils/internal";
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
	 * local IDs.
	 */
	summaryBlobs?: Map<string, ArrayBufferLike>;
	/**
	 * Local IDs whose payload can be referenced by handle from the previous summary.
	 */
	summaryBlobHandles?: Set<string>;
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
 * Prefix for trees containing inlined attachment blobs. The suffix is the
 * BlobManager local ID.
 * @internal
 */
export const inlinedAttachmentBlobTreePrefix = ".inline_";

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
		.filter(([k, _]) => k !== redirectTableBlobName)
		.map(([_, v]) => v);

	const inlinedBlobIds = new Map<string, string>();
	for (const [treeName, childTree] of Object.entries(blobsTree.trees)) {
		if (!treeName.startsWith(inlinedAttachmentBlobTreePrefix)) {
			continue;
		}
		const localId = treeName.slice(inlinedAttachmentBlobTreePrefix.length);
		const blobId: string | undefined = childTree.blobs[inlinedAttachmentBlobContentName];
		assert(blobId !== undefined, "Inlined attachment blob tree must contain content");
		inlinedBlobIds.set(localId, blobId);
	}

	if (context.attachState === AttachState.Detached) {
		const detachedSummaryBlobs = new Map<string, ArrayBufferLike>();
		await Promise.all(
			[...inlinedBlobIds].map(async ([localId, blobId]) => {
				detachedSummaryBlobs.set(
					localId,
					context.snapshotWithContents?.blobContents.get(blobId) ??
						(await context.storage.readBlob(blobId)),
				);
			}),
		);
		redirectTableEntries.push(
			...[...inlinedBlobIds.keys()].map((localId) => [localId, localId] as [string, string]),
		);
		return {
			ids,
			redirectTable: redirectTableEntries,
			summaryBlobs: detachedSummaryBlobs,
		};
	}

	const summaryBlobs = new Map<string, ArrayBufferLike>();
	const summaryBlobHandles = new Set<string>();
	for (const [localId, blobId] of inlinedBlobIds) {
		redirectTableEntries.push([localId, blobId]);
		ids.push(blobId);
		summaryBlobHandles.add(localId);
		const content =
			context.snapshotWithContents?.blobContents.get(blobId) ??
			(context.pendingLocalState === undefined
				? undefined
				: await context.storage.readBlob(blobId));
		if (content !== undefined) {
			summaryBlobs.set(localId, content);
		}
	}
	return {
		ids,
		redirectTable: redirectTableEntries,
		summaryBlobs: summaryBlobs.size === 0 ? undefined : summaryBlobs,
		summaryBlobHandles,
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
	summaryBlobs?: ReadonlyMap<string, ArrayBufferLike>,
	summaryBlobHandles?: ReadonlySet<string>,
): ISummaryTreeWithStats => summarizeV1(redirectTable, summaryBlobs, summaryBlobHandles);

const summarizeV1 = (
	redirectTable: Map<string, string>,
	summaryBlobs?: ReadonlyMap<string, ArrayBufferLike>,
	summaryBlobHandles?: ReadonlySet<string>,
): ISummaryTreeWithStats => {
	const builder = new SummaryTreeBuilder();
	const storageIds = getStorageIds(redirectTable);
	const inlineStorageIds = new Set<string>();
	for (const localId of new Set([
		...(summaryBlobs?.keys() ?? []),
		...(summaryBlobHandles ?? []),
	])) {
		const storageId = redirectTable.get(localId);
		if (storageId !== undefined) {
			inlineStorageIds.add(storageId);
		}
		const blobBuilder = new SummaryTreeBuilder({
			groupId: `${inlinedAttachmentBlobGroupIdPrefix}${localId}`,
		});
		const summaryBlob = summaryBlobs?.get(localId);
		if (summaryBlob === undefined) {
			blobBuilder.addHandle(
				inlinedAttachmentBlobContentName,
				SummaryType.Blob,
				`/${blobsTreeName}/${inlinedAttachmentBlobTreePrefix}${localId}/${inlinedAttachmentBlobContentName}`,
			);
		} else {
			blobBuilder.addBlob(inlinedAttachmentBlobContentName, new Uint8Array(summaryBlob));
		}
		builder.addWithStats(
			`${inlinedAttachmentBlobTreePrefix}${localId}`,
			blobBuilder.getSummaryTree(),
		);
	}
	for (const storageId of storageIds) {
		if (!inlineStorageIds.has(storageId)) {
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
			summaryBlobs?.has(localId) !== true &&
			summaryBlobHandles?.has(localId) !== true,
	);
	if (nonIdentityRedirectTableEntries.length > 0) {
		builder.addBlob(redirectTableBlobName, JSON.stringify(nonIdentityRedirectTableEntries));
	}

	return builder.getSummaryTree();
};

export const getStorageIds = (redirectTable: Map<string, string>): Set<string> => {
	return new Set<string>(redirectTable.values());
};
