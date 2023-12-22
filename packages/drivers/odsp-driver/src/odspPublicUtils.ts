/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { hashFile, IsoBuffer } from "@fluid-internal/client-utils";
import { ISequencedDocumentMessage, ISnapshotTree } from "@fluidframework/protocol-definitions";

/**
 * @alpha
 */
export async function getHashedDocumentId(driveId: string, itemId: string): Promise<string> {
	const buffer = IsoBuffer.from(`${driveId}_${itemId}`);
	return encodeURIComponent(await hashFile(buffer, "SHA-256", "base64"));
}

/**
 * @alpha
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
