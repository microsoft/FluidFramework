/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IsoBuffer, hashFile } from "@fluid-internal/client-utils";
import {
	ISnapshotTree,
	ISequencedDocumentMessage,
} from "@fluidframework/driver-definitions/internal";

/**
 * Creates a unique and stable id for a document stored in ODSP which doesn't expose the driveId and itemId of
 * said document.
 *
 * @legacy
 * @alpha
 */
export async function getHashedDocumentId(driveId: string, itemId: string): Promise<string> {
	const buffer = IsoBuffer.from(`${driveId}_${itemId}`);
	return encodeURIComponent(await hashFile(buffer, "SHA-256", "base64"));
}

/**
 * @legacy
 * @alpha
 * @deprecated - This is deprecated.
 */
export interface ISnapshotContents {
	snapshotTree: ISnapshotTree;
	blobs: Map<string, ArrayBuffer>;
	ops: ISequencedDocumentMessage[];

	/**
	 * Sequence number of the snapshot
	 */
	sequenceNumber: number | undefined;

	/**
	 * Sequence number for the latest op/snapshot for the file in ODSP
	 */
	latestSequenceNumber: number | undefined;
}
