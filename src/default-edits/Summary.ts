/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { TraitLabel } from '../Identifiers';
import { assert } from '../Common';
import { OrderedEditSet } from '../EditLog';
import { RevisionView } from '../TreeView';
import { initialTree } from '../InitialTree';
import { SharedTreeSummary_0_0_2 } from '../SummaryBackCompatibility';
import { formatVersion, newEdit, SharedTreeSummary } from '../generic';
import { Change } from './PersistedTypes';
import { setTrait } from './EditUtilities';

/**
 * Does not preserve (persist) history at all.
 * Instead, the history returned in the summary will contain a single change that creates a revision identical to the supplied view.
 * @public
 */
export function noHistorySummarizer(
	_editLog: OrderedEditSet<Change>,
	currentView: RevisionView
): SharedTreeSummary_0_0_2<Change> {
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
		currentTree,
		sequencedEdits: [{ id: edit.id, changes: edit.changes }],
		version: formatVersion,
	};
}

/**
 * Does not preserve (persist) history at all.
 * Instead, the history returned in the summary will contain a single change that creates a revision identical to the supplied view.
 * Writes summary format 0.1.0.
 * @public
 */
export function noHistorySummarizer_0_1_0(
	_editLog: OrderedEditSet<Change>,
	currentView: RevisionView
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
		currentTree,
		editHistory: {
			editChunks: [{ startRevision: 0, chunk: [{ changes: edit.changes }] }],
			editIds: [edit.id],
		},
		version: '0.1.0',
	};
}
