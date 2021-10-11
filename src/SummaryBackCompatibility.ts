/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ITelemetryProperties } from '@fluidframework/common-definitions';
import { IFluidSerializer } from '@fluidframework/core-interfaces';
import { fail } from './Common';
import { EditLog, getNumberOfHandlesFromEditLogSummary } from './EditLog';
import { ChangeNode, Edit, SharedTreeSummaryBase, SharedTreeSummary } from './generic';

/** The summary format version that is read by SharedTree. */
export const readFormatVersion = '0.1.1';

/**
 * Legacy summary format currently still used for writing.
 * TODO:#49901: Remove export when this format is no longer written.
 * @internal
 */
export interface SharedTreeSummary_0_0_2<TChange> extends SharedTreeSummaryBase {
	readonly currentTree: ChangeNode;
	/**
	 * A list of edits.
	 */
	readonly sequencedEdits: readonly Edit<TChange>[];
	readonly version: '0.0.2';
}

/**
 * Deserializes a JSON object produced by `serialize()` and uses it to initialize the tree with the encoded state.
 * Also constructs handle objects from their serialized form.
 *
 * @param jsonSummary - The string to deserialize.
 * @param serializer - The serializer required to deserialize handles in the string.
 * @returns A SharedTree summary.
 * @throws If the summary could not be interpreted.
 *
 */
export function deserialize(jsonSummary: string, serializer: IFluidSerializer): SharedTreeSummaryBase {
	let summary: Partial<SharedTreeSummaryBase>;
	try {
		summary = serializer.parse(jsonSummary);
	} catch {
		fail('Json syntax error in Summary');
	}

	if (typeof summary !== 'object') {
		fail('Summary is not an object');
	}

	const { version } = summary;

	if (version !== undefined) {
		return { version, ...summary };
	}

	fail('Missing fields on summary');
}

/**
 * @returns SharedTreeSummary that can be used to initialize a SharedTree.
 * @throws If the summary could not be converted.
 */
export function convertSummaryToReadFormat<TChange>(summary: SharedTreeSummaryBase): SharedTreeSummary<TChange> {
	const { version } = summary;

	if (version === readFormatVersion) {
		const { currentTree, editHistory } = summary as SharedTreeSummary<TChange>;

		if (editHistory !== undefined) {
			if (typeof editHistory !== 'object') {
				fail('Edit history is not an object');
			}

			const { editChunks, editIds } = editHistory;

			// TODO:#45414: Add more robust validation of the summary's fields. Even if they are present, they may be malformed.
			if (editChunks !== undefined && editIds !== undefined) {
				return { currentTree, editHistory, version };
			}
		}
	} else if (version === '0.0.2') {
		const { currentTree, sequencedEdits } = summary as SharedTreeSummary_0_0_2<TChange>;

		if (sequencedEdits !== undefined) {
			/**
			 * The number of edits that can safely fit in a blob upload.
			 */
			const maxChunkSize = 1000;

			// This saves all of the edits in the summary as part of the first chunk.
			const temporaryLog = new EditLog<TChange>(undefined, undefined, undefined, maxChunkSize);
			sequencedEdits.forEach((edit) =>
				temporaryLog.addSequencedEdit(edit, { sequenceNumber: 1, referenceSequenceNumber: 0 })
			);

			return {
				currentTree,
				editHistory: temporaryLog.getEditLogSummary(),
				version: readFormatVersion,
			};
		}
	} else {
		fail('Format version is not supported');
	}

	fail('Missing fields on summary');
}

/**
 * General statistics about summaries.
 */
export interface SummaryStatistics extends ITelemetryProperties {
	/** Format version the summary is written in. */
	readonly formatVersion: string;
	/** Number of edits. */
	readonly historySize: number;
	/** Number of edit chunks in the history. */
	readonly totalNumberOfChunks?: number;
	/** Number of chunks in the summary that have handles stored. */
	readonly uploadedChunks?: number;
}

/**
 * @returns SummaryStatistics.
 * @throws If statistics could not be obtained from the summary.
 */
export function getSummaryStatistics<TChange>(summary: SharedTreeSummaryBase): SummaryStatistics {
	const { version } = summary;

	if (version === '0.1.1') {
		const { editHistory } = summary as SharedTreeSummary<TChange>;

		if (editHistory !== undefined) {
			if (typeof editHistory !== 'object') {
				fail('Edit history is not an object');
			}

			const { editChunks, editIds } = editHistory;

			// TODO:#45414: Add more robust validation of the summary's fields. Even if they are present, they may be malformed.
			if (editChunks !== undefined && editIds !== undefined) {
				return {
					formatVersion: version,
					historySize: editIds.length,
					totalNumberOfChunks: editChunks.length,
					uploadedChunks: getNumberOfHandlesFromEditLogSummary(editHistory),
				};
			}

			fail('Missing fields on edit log summary');
		}
	} else if (version === '0.0.2') {
		const { sequencedEdits } = summary as SharedTreeSummary_0_0_2<TChange>;

		return {
			formatVersion: version,
			historySize: sequencedEdits.length,
		};
	} else {
		fail('Format version is not supported');
	}

	fail('Missing fields on summary');
}
