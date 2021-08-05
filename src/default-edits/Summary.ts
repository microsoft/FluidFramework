/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { v5 as uuidv5 } from 'uuid';
import { DetachedSequenceId, EditId, TraitLabel } from '../Identifiers';
import { assert } from '../Common';
import { OrderedEditSet } from '../EditLog';
import { RevisionView } from '../TreeView';
import { initialTree } from '../InitialTree';
import { readFormatVersion, SharedTreeSummary_0_0_2 } from '../SummaryBackCompatibility';
import {
	formatVersion,
	fullHistorySummarizer,
	fullHistorySummarizer_0_1_1,
	newEdit,
	SharedTreeSummary,
	SharedTreeSummaryBase,
	SharedTreeSummaryWriteFormat,
} from '../generic';
import { Change, StablePlace } from './PersistedTypes';
import { setTrait } from './EditUtilities';

const uuidNamespace = '44864298-500e-4cf8-9f44-a249e5b3a286';

/**
 * Handler for summarizing the tree state without history. Only used for testing.
 * The handler is invoked when saving a summary. It accepts a view of the current state of the tree and the sequenced edits known
 * to the SharedTree.
 * @param stable - Generates the summary with stable edit IDs. False by default.
 * @returns a summary of the supplied state.
 */
export type SharedTreeNoHistorySummarizer = (
	editLog: OrderedEditSet<Change>,
	currentView: RevisionView,
	stable: boolean
) => SharedTreeSummaryBase;

/**
 * Does not preserve (persist) history at all.
 * Instead, the history returned in the summary will contain a single edit that creates a revision identical to the supplied view.
 * @param stable - Generates the single edit with a stable edit ID. False by default, used for testing.
 */
export function noHistorySummarizer(
	_editLog: OrderedEditSet<Change>,
	currentView: RevisionView,
	stable = false
): SharedTreeSummary_0_0_2<Change> {
	const currentTree = currentView.getChangeNodeTree();
	const rootId = currentTree.identifier;
	const changes: Change[] = [];
	// Generate a set of changes to set the root node's children to that of the root in the currentTree
	Object.entries(currentTree.traits).forEach(([label, children]) => {
		const id = 0 as DetachedSequenceId;
		changes.push(
			Change.build(children, id),
			Change.insert(id, StablePlace.atStartOf({ parent: rootId, label: label as TraitLabel }))
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
	_editLog: OrderedEditSet<Change>,
	currentView: RevisionView,
	stable = false
): SharedTreeSummary<Change> {
	const currentTree = currentView.getChangeNodeTree();
	const rootId = currentTree.identifier;
	const changes: Change[] = [];
	// Generate a set of changes to set the root node's children to that of the root in the currentTree
	Object.entries(currentTree.traits).forEach(([label, children]) => {
		changes.push(...setTrait({ parent: rootId, label: label as TraitLabel }, children));
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
	editLog: OrderedEditSet<Change>,
	currentView: RevisionView,
	summarizeHistory = true,
	writeSummaryFormat = SharedTreeSummaryWriteFormat.Format_0_0_2
): SharedTreeSummaryBase {
	if (summarizeHistory) {
		switch (writeSummaryFormat) {
			case SharedTreeSummaryWriteFormat.Format_0_0_2:
				return fullHistorySummarizer(editLog, currentView);
			case SharedTreeSummaryWriteFormat.Format_0_1_1:
				return fullHistorySummarizer_0_1_1(editLog, currentView);
			default:
				throw new Error(`Summary format ${writeSummaryFormat} not supported.`);
		}
	}

	switch (writeSummaryFormat) {
		case SharedTreeSummaryWriteFormat.Format_0_0_2:
			return noHistorySummarizer(editLog, currentView);
		case SharedTreeSummaryWriteFormat.Format_0_1_1:
			return noHistorySummarizer_0_1_1(editLog, currentView);
		default:
			throw new Error(`Summary format ${writeSummaryFormat} not supported.`);
	}
}
