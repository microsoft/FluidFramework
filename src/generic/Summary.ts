/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHandle } from '@fluidframework/core-interfaces';
import { IFluidSerializer, serializeHandles } from '@fluidframework/shared-object-base';
import { assertNotUndefined } from '../Common';
import { StringInterner } from '../StringInterner';
import { getChangeNode_0_0_2FromView } from '../SerializationUtilities';
import { TreeCompressor_0_1_1 } from './TreeCompressor';
import { RevisionView } from './RevisionView';
import {
	Edit,
	EditLogSummary,
	SharedTreeSummaryBase,
	SharedTreeSummary_0_0_2,
	SharedTreeSummary,
	ChangeNode,
	WriteFormat,
} from './persisted-types';
import { NodeIdConverter } from './NodeIdUtilities';

/**
 * Format version for summaries that are written.
 * When next changing the format, we should add a new format version variable for the edit-specific summaries and assign it an independent
 * version number.
 */
export const formatVersion = WriteFormat.v0_0_2;

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
 * The contents of a SharedTree summary, converted to a common internal format that can be
 * loaded into a SharedTree.
 * @internal
 */
export interface SummaryContents<TChange> {
	readonly currentTree?: ChangeNode;

	/**
	 * Information that can populate an edit log.
	 */
	readonly editHistory: EditLogSummary<TChange>;
}

/**
 * A function which produces the summary of an edit log
 * @internal
 */
export type EditLogSummarizer<TChange = any> = (useHandles?: boolean) => EditLogSummary<TChange>;

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
		version: WriteFormat.v0_0_2,
	};
}

/**
 * Generates a summary with format version 0.1.0. This will prefer handles over edits in edit chunks where possible,
 * and string interning and tree compression will be applied.
 */
export function fullHistorySummarizer_0_1_1<TChange>(
	summarizeLog: EditLogSummarizer,
	currentView: RevisionView,
	idConverter: NodeIdConverter
): SharedTreeSummary<TChange> {
	const stringInterner = new StringInterner();
	const treeCompressor = new TreeCompressor_0_1_1<never>();
	const currentTree = treeCompressor.compress(getChangeNode_0_0_2FromView(currentView, idConverter), stringInterner);
	return {
		currentTree,
		editHistory: summarizeLog(true),
		version: WriteFormat.v0_1_1,
		internedStrings: stringInterner.getSerializable(),
	};
}
