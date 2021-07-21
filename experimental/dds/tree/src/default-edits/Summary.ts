/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TraitLabel } from '../Identifiers';
import { assert } from '../Common';
import { OrderedEditSet } from '../EditLog';
import { Snapshot } from '../Snapshot';
import { initialTree } from '../InitialTree';
import { SharedTreeSummary_0_0_2 } from '../SummaryBackCompatibility';
import { formatVersion, newEdit } from '../generic';
import { Change } from './PersistedTypes';
import { setTrait } from './EditUtilities';

/**
 * Does not preserve (persist) history at all.
 * Instead, the history returned in the summary will contain a single change that creates a revision identical to the supplied view.
 * @public
 */
export function noHistorySummarizer(
	_editLog: OrderedEditSet<Change>,
	currentView: Snapshot
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
