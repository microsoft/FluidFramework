/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { TraitLabel } from './Identifiers';
import { assert, assertNotUndefined } from './Common';
import { EditLogSummary, OrderedEditSet } from './EditLog';
import { newEdit, setTrait } from './EditUtilities';
import { ChangeNode, Edit, Change } from './PersistedTypes';
import { Snapshot } from './Snapshot';
import { initialTree } from './InitialTree';
import { readFormatVersion, SharedTreeSummary_0_0_2 } from './SummaryBackCompatibility';

/**
 * Format version for summaries that are written.
 */
const formatVersion = '0.0.2';

/**
 * Handler for summarizing the tree state.
 * The handler is invoked when saving a summary. It accepts a view of the current state of the tree, the sequenced edits known
 * to the SharedTree, and optional helpers for serializing the edit information.
 * @returns a summary of the supplied state.
 * @public
 */
export type SharedTreeSummarizer = (editLog: OrderedEditSet, currentView: Snapshot) => SharedTreeSummaryBase;

/**
 * A developer facing (non-localized) error message.
 * TODO: better error system.
 */
export type ErrorString = string;

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
export interface SharedTreeSummary extends SharedTreeSummaryBase {
	readonly currentTree: ChangeNode;

	/**
	 * Information that can populate an edit log.
	 */
	readonly editHistory?: EditLogSummary;
}

/**
 * Serializes a SharedTree summary into a JSON string. This may later be used to initialize a SharedTree's state via `deserialize()`
 */
export function serialize(summary: SharedTreeSummaryBase): string {
	return JSON.stringify(summary);
}

/**
 * Preserves the full history in the generated summary.
 * @public
 */
export function fullHistorySummarizer(editLog: OrderedEditSet, currentView: Snapshot): SharedTreeSummary_0_0_2 {
	const { editChunks, editIds } = editLog.getEditLogSummary();

	const sequencedEdits: Edit[] = [];
	let idIndex = 0;
	editChunks.forEach(({ chunk }) => {
		assert(
			Array.isArray(chunk),
			'Handles should not be included in the summary until format version 0.1.0 is being written.'
		);

		chunk.forEach(({ changes }) => {
			sequencedEdits.push({
				changes,
				id: assertNotUndefined(editIds[idIndex++], 'Number of edits should match number of edit IDs.'),
			});
		});
	});

	return {
		currentTree: currentView.getChangeNodeTree(),
		sequencedEdits,
		version: formatVersion,
	};
}

/**
 * Generates a summary with format version 0.1.0. This will prefer handles over edits in edit chunks where possible.
 */
export function fullHistorySummarizer_0_1_0(editLog: OrderedEditSet, currentView: Snapshot): SharedTreeSummary {
	return {
		currentTree: currentView.getChangeNodeTree(),
		editHistory: editLog.getEditLogSummary(true),
		version: readFormatVersion,
	};
}

/**
 * Does not preserve (persist) history at all.
 * Instead, the history returned in the summary will contain a single change that creates a revision identical to the supplied view.
 * @public
 */
export function noHistorySummarizer(_editLog: OrderedEditSet, currentView: Snapshot): SharedTreeSummary_0_0_2 {
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
