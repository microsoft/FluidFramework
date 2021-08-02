/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IsoBuffer } from '@fluidframework/common-utils';
import { EditHandle, OrderedEditSet } from '../EditLog';
import { EditWithoutId } from './PersistedTypes';

/**
 * Format used for exporting an uploaded edit chunk and its associated handle path. Primarily used for testing SharedTree summaries.
 * @public
 */
export interface UploadedEditChunkContents<TChange> {
	/**
	 * The handle path associated with the edit chunk.
	 */
	absolutePath: string;
	/**
	 * The edits uploaded as part of the edit chunk.
	 */
	chunkContents: EditWithoutId<TChange>[];
}

/**
 * Returns a list of blob paths and their associated contents for all uploaded edit chunks in the given edit log, in order of edit sequence numbers.
 * @public
 */
export async function saveUploadedEditChunkContents<TChange>(
	editLog: OrderedEditSet<TChange>
): Promise<UploadedEditChunkContents<TChange>[]> {
	const editChunks: UploadedEditChunkContents<TChange>[] = [];
	const { editChunks: editsOrHandles } = editLog.getEditLogSummary(true);
	for (const { chunk } of editsOrHandles) {
		if (!Array.isArray(chunk)) {
			const handle = chunk as EditHandle;

			editChunks.push({
				absolutePath: handle.absolutePath,
				chunkContents: JSON.parse(IsoBuffer.from(await handle.get()).toString())
					.edits as EditWithoutId<TChange>[],
			});
		}
	}

	return editChunks;
}
