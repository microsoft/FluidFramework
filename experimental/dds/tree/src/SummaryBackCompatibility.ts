/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EditLog } from './EditLog';
import { ChangeNode, Edit } from './PersistedTypes';
import { ErrorString, SharedTreeSummary, SharedTreeSummaryBase } from './Summary';

/** The summary format version that is read by SharedTree. */
export const readFormatVersion = '0.1.0';

/**
 * Legacy summary format currently still used for writing.
 * TODO:#49901: Remove export when this format is no longer written.
 * @internal
 */
export interface SharedTreeSummary_0_0_2 extends SharedTreeSummaryBase {
	readonly currentTree: ChangeNode;

	/**
	 * A list of edits.
	 */
	readonly sequencedEdits: readonly Edit[];
}

/**
 * Deserializes a JSON object produced by `serialize()` and uses it to initialize the tree with the encoded state.
 * @returns A SharedTree summary or an ErrorString if the summary could not be interpreted.
 *
 */
export function deserialize(jsonSummary: string): SharedTreeSummaryBase | ErrorString {
	let summary: Partial<SharedTreeSummaryBase>;
	try {
		summary = JSON.parse(jsonSummary);
	} catch {
		return 'Json syntax error in Summary';
	}

	if (typeof summary !== 'object') {
		return 'Summary is not an object';
	}

	const { version } = summary;

	if (version !== undefined) {
		return { version, ...summary };
	}

	return 'Missing fields on summary';
}

/**
 * @returns SharedTreeSummary that can be used to initialize a SharedTree, or an ErrorString if the summary could not be converted.
 *
 */
export function convertSummaryToReadFormat(summary: SharedTreeSummaryBase): SharedTreeSummary | ErrorString {
	const { version } = summary;

	if (version === readFormatVersion) {
		const { currentTree, editHistory } = summary as SharedTreeSummary;

		if (editHistory !== undefined) {
			if (typeof editHistory !== 'object') {
				return 'Edit history is not an object';
			}

			const { editChunks, editIds } = editHistory;

			// TODO:#45414: Add more robust validation of the summary's fields. Even if they are present, they may be malformed.
			if (editChunks !== undefined && editIds !== undefined) {
				return { currentTree, editHistory, version };
			}
		}
	} else if (version === '0.0.2') {
		const { currentTree, sequencedEdits } = summary as SharedTreeSummary_0_0_2;

		if (sequencedEdits !== undefined) {
			const temporaryLog = new EditLog();

			sequencedEdits.forEach((edit) => {
				temporaryLog.addSequencedEdit(edit);
			});

			return {
				currentTree,
				editHistory: temporaryLog.getEditLogSummary(),
				version: readFormatVersion,
			};
		}
	} else {
		return 'Format version is not supported';
	}

	return 'Missing fields on summary';
}
