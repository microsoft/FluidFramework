/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ITelemetryBaseProperties } from '@fluidframework/core-interfaces';
import type { IFluidSerializer } from '@fluidframework/shared-object-base/internal';

import { fail } from './Common.js';
import { getNumberOfHandlesFromEditLogSummary } from './EditLog.js';
import {
	SharedTreeSummary,
	SharedTreeSummaryBase,
	SharedTreeSummary_0_0_2,
	WriteFormat,
} from './persisted-types/index.js';

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
		summary = serializer.parse(jsonSummary) as Partial<SharedTreeSummaryBase>;
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
 * General statistics about summaries.
 */
export interface SummaryStatistics extends ITelemetryBaseProperties {
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
export function getSummaryStatistics(summary: SharedTreeSummaryBase): SummaryStatistics {
	const { version } = summary;

	if (version === WriteFormat.v0_1_1) {
		const { editHistory } = summary as SharedTreeSummary;

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
	} else if (version === WriteFormat.v0_0_2) {
		const { sequencedEdits } = summary as SharedTreeSummary_0_0_2;

		return {
			formatVersion: version,
			historySize: sequencedEdits.length,
		};
	} else {
		fail('Format version is not supported');
	}

	fail('Missing fields on summary');
}
