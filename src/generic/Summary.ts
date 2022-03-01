/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHandle } from '@fluidframework/core-interfaces';
import { IFluidSerializer, serializeHandles } from '@fluidframework/shared-object-base';
import { assertNotUndefined } from '../Common';
import { EditLogSummary } from '../EditLog';
import { readFormatVersion, SharedTreeSummary_0_0_2 } from '../SummaryBackCompatibility';
import { getChangeNode_0_0_2FromView } from '../SerializationUtilities';
import { RevisionView } from './RevisionView';
import { ChangeNode_0_0_2, Edit } from './PersistedTypes';
import { NodeIdConverter } from './NodeIdUtilities';

/**
 * Format version for summaries that are written.
 * When next changing the format, we should add a new format version variable for the edit-specific summaries and assign it an independent
 * version number.
 */
export const formatVersion = '0.0.2';

/**
 * Handler for summarizing the tree state.
 * The handler is invoked when saving a summary. It accepts a view of the current state of the tree and the sequenced edits known
 * to the SharedTree.
 * @returns a summary of the supplied state.
 * @internal
 */
export type SharedTreeSummarizer = (
	logSummarizer: EditLogSummarizer,
	currentView: RevisionView
) => SharedTreeSummaryBase;

/**
 * A function which produces the summary of an edit log
 * @internal
 */
export type EditLogSummarizer<TChange = any> = (useHandles?: boolean) => EditLogSummary<TChange>;

/**
 * The minimal information on a SharedTree summary. Contains the summary format version.
 */
export interface SharedTreeSummaryBase {
	/**
	 * Field on summary under which version is stored.
	 */
	readonly version: string;
}

/**
 * The contents of a SharedTree summary: the current tree, and the edits needed to get from `initialTree` to the current tree.
 * @public
 */
export interface SharedTreeSummary<TChange> extends SharedTreeSummaryBase {
	readonly currentTree?: ChangeNode_0_0_2;

	/**
	 * Information that can populate an edit log.
	 */
	readonly editHistory?: EditLogSummary<TChange>;
}

/**
 * Serializes a SharedTree summary into a JSON string. This may later be used to initialize a SharedTree's state via `deserialize()`
 * Also replaces handle objects with their serialized form.
 *
 * @param summary - The SharedTree summary to serialize.
 * @param serializer - The serializer required to serialize handles in the summary.
 * @param bind - The object handle required to serialize handles in the summary
 */
export function serialize(summary: SharedTreeSummaryBase, serializer: IFluidSerializer, bind: IFluidHandle): string {
	return assertNotUndefined(serializeHandles(summary, serializer, bind));
}

/**
 * Preserves the full history in the generated summary.
 * @public
 */
export function fullHistorySummarizer<TChange>(
	summarizeLog: EditLogSummarizer<unknown>,
	currentView: RevisionView,
	idConverter: NodeIdConverter
): SharedTreeSummary_0_0_2<TChange> | SharedTreeSummary<TChange> {
	const { editChunks, editIds } = summarizeLog();

	const sequencedEdits: Edit<TChange>[] = [];
	let idIndex = 0;
	let includesHandles = false;
	editChunks.forEach(({ chunk }) => {
		if (Array.isArray(chunk)) {
			chunk.forEach(({ changes }) => {
				sequencedEdits.push({
					changes,
					id: assertNotUndefined(editIds[idIndex++], 'Number of edits should match number of edit IDs.'),
				});
			});
		} else {
			includesHandles = true;
		}
	});

	// If the edit log includes handles without associated edits, we must write a summary version that supports handles.
	if (includesHandles) {
		return fullHistorySummarizer_0_1_1(summarizeLog, currentView, idConverter);
	}

	return {
		currentTree: getChangeNode_0_0_2FromView(currentView, idConverter),
		sequencedEdits,
		version: formatVersion,
	};
}

/**
 * Generates a summary with format version 0.1.0. This will prefer handles over edits in edit chunks where possible.
 */
export function fullHistorySummarizer_0_1_1<TChange>(
	summarizeLog: EditLogSummarizer,
	currentView: RevisionView,
	idConverter: NodeIdConverter
): SharedTreeSummary<TChange> {
	return {
		currentTree: getChangeNode_0_0_2FromView(currentView, idConverter),
		editHistory: summarizeLog(true),
		version: readFormatVersion,
	};
}
