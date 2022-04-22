/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IsoBuffer } from '@fluidframework/common-utils';
import type { EditLog } from './EditLog';
import type { ChangeInternal, EditChunkContents, FluidEditHandle } from './persisted-types';
import type { SharedTree } from './SharedTree';

/**
 * Format used for exporting an uploaded edit chunk and its associated handle path. Primarily used for testing SharedTree summaries.
 * @public
 */
export interface UploadedEditChunkContents {
	/**
	 * The handle path associated with the edit chunk.
	 */
	absolutePath: string;
	/**
	 * The edits uploaded as part of the edit chunk.
	 */
	chunkContents: EditChunkContents;
}

/**
 * Returns a list of blob paths and their associated contents for all uploaded edit chunks in the given edit log, in order of edit sequence numbers.
 * The contents will not be decoded from the format used in the blob.
 */
export async function getUploadedEditChunkContents(sharedTree: SharedTree): Promise<UploadedEditChunkContents[]> {
	const editChunks: UploadedEditChunkContents[] = [];
	const { editChunks: editsOrHandles } = (sharedTree.edits as unknown as EditLog<ChangeInternal>).getEditLogSummary();
	for (const { chunk } of editsOrHandles) {
		if (!Array.isArray(chunk)) {
			const handle = chunk as FluidEditHandle;

			const chunkContents: EditChunkContents = JSON.parse(IsoBuffer.from(await handle.get()).toString());
			editChunks.push({
				absolutePath: handle.absolutePath,
				chunkContents,
			});
		}
	}

	return editChunks;
}

/**
 * Returns a serialized description of blob paths and their associated contents for all uploaded edit chunks in the given edit log.
 * @public
 */
export async function getSerializedUploadedEditChunkContents(sharedTree: SharedTree): Promise<string> {
	return JSON.stringify(await getUploadedEditChunkContents(sharedTree));
}
