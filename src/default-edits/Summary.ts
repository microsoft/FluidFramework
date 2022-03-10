/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { v5 as uuidv5 } from 'uuid';
import { DetachedSequenceId, EditId, TraitLabel } from '../Identifiers';
import { assert } from '../Common';
import { initialTree } from '../InitialTree';
import { readFormatVersion } from '../SummaryBackCompatibility';
import {
	EditLogSummarizer,
	formatVersion,
	fullHistorySummarizer,
	fullHistorySummarizer_0_1_1,
	newEdit,
	NodeIdConverter,
	RevisionView,
	SharedTreeSummary,
	SharedTreeSummaryBase,
	SharedTreeSummaryWriteFormat,
	SharedTreeSummary_0_0_2,
} from '../generic';
import { getChangeNode_0_0_2FromView } from '../SerializationUtilities';
import { ChangeInternal, StablePlaceInternal_0_0_2 } from './persisted-types';
import { setTraitInternal } from './EditUtilities';

const uuidNamespace = '44864298-500e-4cf8-9f44-a249e5b3a286';

/**
 * Handler for summarizing the tree state without history. Only used for testing.
 * The handler is invoked when saving a summary. It accepts a view of the current state of the tree and the sequenced edits known
 * to the SharedTree.
 * @param stable - Generates the summary with stable edit IDs. False by default.
 * @returns a summary of the supplied state.
 */
export type SharedTreeNoHistorySummarizer = (
	summarizeLog: EditLogSummarizer,
	currentView: RevisionView,
	idConverter: NodeIdConverter,
	stable: boolean
) => SharedTreeSummaryBase;

/**
 * Does not preserve (persist) history at all.
 * Instead, the history returned in the summary will contain a single edit that creates a revision identical to the supplied view.
 * @param stable - Generates the single edit with a stable edit ID. False by default, used for testing.
 */
export function noHistorySummarizer(
	_summarizeLog: EditLogSummarizer,
	currentView: RevisionView,
	idConverter: NodeIdConverter,
	stable = false
): SharedTreeSummary_0_0_2<ChangeInternal> {
	const currentTree = getChangeNode_0_0_2FromView(currentView, idConverter);
	const rootId = currentTree.identifier;
	const changes: ChangeInternal[] = [];
	// Generate a set of changes to set the root node's children to that of the root in the currentTree
	Object.entries(currentTree.traits).forEach(([label, children]) => {
		const id = 0 as DetachedSequenceId;
		changes.push(
			ChangeInternal.build(children, id),
			ChangeInternal.insert(
				id,
				StablePlaceInternal_0_0_2.atStartOf({ parent: rootId, label: label as TraitLabel })
			)
		);
	});
	assert(currentTree.payload === undefined, 'setValue not yet supported.');
	assert(
		currentTree.identifier === initialTree.identifier && currentTree.definition === initialTree.definition,
		'root definition and identifier should be immutable.'
	);
	const edit = newEdit(changes);

	return {
		currentTree,
		sequencedEdits: [
			{
				id: stable ? (uuidv5(JSON.stringify(changes), uuidNamespace) as EditId) : edit.id,
				changes: edit.changes,
			},
		],
		version: formatVersion,
	};
}

/**
 * Does not preserve (persist) history at all.
 * Instead, the history returned in the summary will contain a single edit that creates a revision identical to the supplied view.
 * Writes summary format 0.1.1 which does not store the currentView for no history summaries.
 * @param stable - Generates the single edit with a stable edit ID. False by default, used for testing.
 */
export function noHistorySummarizer_0_1_1(
	_summarizeLog: EditLogSummarizer,
	currentView: RevisionView,
	idConverter: NodeIdConverter,
	stable = false
): SharedTreeSummary<ChangeInternal> {
	const currentTree = getChangeNode_0_0_2FromView(currentView, idConverter);
	const rootId = currentTree.identifier;
	const changes: ChangeInternal[] = [];
	// Generate a set of changes to set the root node's children to that of the root in the currentTree
	Object.entries(currentTree.traits).forEach(([label, children]) => {
		changes.push(...setTraitInternal({ parent: rootId, label: label as TraitLabel }, children));
	});
	assert(currentTree.payload === undefined, 'setValue not yet supported.');
	assert(
		currentTree.identifier === initialTree.identifier && currentTree.definition === initialTree.definition,
		'root definition and identifier should be immutable.'
	);
	const edit = newEdit(changes);

	return {
		editHistory: {
			editChunks: [{ startRevision: 0, chunk: [{ changes: edit.changes }] }],
			editIds: [stable ? (uuidv5(JSON.stringify(changes), uuidNamespace) as EditId) : edit.id],
		},
		version: readFormatVersion,
	};
}

/**
 * Generates a summary based on provided options.
 */
export function getSummaryByVersion(
	summarizeLog: EditLogSummarizer,
	currentView: RevisionView,
	idConverter: NodeIdConverter,
	summarizeHistory = true,
	writeSummaryFormat = SharedTreeSummaryWriteFormat.Format_0_0_2
): SharedTreeSummaryBase {
	if (summarizeHistory) {
		switch (writeSummaryFormat) {
			case SharedTreeSummaryWriteFormat.Format_0_0_2:
				return fullHistorySummarizer(summarizeLog, currentView, idConverter);
			case SharedTreeSummaryWriteFormat.Format_0_1_1:
				return fullHistorySummarizer_0_1_1(summarizeLog, currentView, idConverter);
			default:
				throw new Error(`Summary format ${writeSummaryFormat} not supported.`);
		}
	}

	switch (writeSummaryFormat) {
		case SharedTreeSummaryWriteFormat.Format_0_0_2:
			return noHistorySummarizer(summarizeLog, currentView, idConverter);
		case SharedTreeSummaryWriteFormat.Format_0_1_1:
			return noHistorySummarizer_0_1_1(summarizeLog, currentView, idConverter);
		default:
			throw new Error(`Summary format ${writeSummaryFormat} not supported.`);
	}
}
