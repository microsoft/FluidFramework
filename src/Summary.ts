/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { TraitLabel } from './Identifiers';
import { assert } from './Common';
import { OrderedEditSet } from './EditLog';
import { newEdit, setTrait } from './EditUtilities';
import { ChangeNode, Edit, Change } from './PersistedTypes';
import { Snapshot } from './Snapshot';
import { initialTree } from './InitialTree';

/**
 * Format version for summaries which is supported.
 * Currently no effort is made to support older/newer documents, and any mismatch is an error.
 */
export const formatVersion = '0.0.2';

/**
 * Handler for summarizing the tree state.
 * The handler is invoked when saving a summary. It accepts a view of the current state of the tree and the sequenced edits known
 * to the SharedTree.
 * @returns a summary of the supplied state.
 * @public
 */
export type SharedTreeSummarizer = (sequencedEdits: OrderedEditSet, currentView: Snapshot) => SharedTreeSummary;

/**
 * A developer facing (non-localized) error message.
 * TODO: better error system.
 */
// eslint-disable-next-line import/no-unused-modules
export type ErrorString = string;

/**
 * The contents of a SharedTree summary: the current tree, and the edits needed to get from `initialTree` to the current tree.
 * @public
 */
export interface SharedTreeSummary {
	readonly currentTree: ChangeNode;
	readonly sequencedEdits: readonly Edit[];

	/**
	 * Field on summary under which version is stored.
	 */
	readonly version: string;
}

/**
 * Serializes a SharedTree summary into a JSON string. This may later be used to initialize a SharedTree's state via `deserialize()`
 */
export function serialize(summary: SharedTreeSummary): string {
	return JSON.stringify(summary);
}

/**
 * Deserializes a JSON object produced by `serialize()` and uses it to initialize the tree with the encoded state.
 * @returns SharedTreeSummary that can be used to initialize a SharedTree, or an ErrorString if the summary could not be interpreted.
 * */
export function deserialize(jsonSummary: string): SharedTreeSummary | ErrorString {
	let summary: Partial<SharedTreeSummary>;
	try {
		summary = JSON.parse(jsonSummary);
	} catch {
		return 'Json syntax error in Summary';
	}

	if (typeof summary !== 'object') {
		return 'Summary is not an object';
	}

	const { currentTree, sequencedEdits, version } = summary;

	if (version !== formatVersion) {
		return 'Summary format version not supported';
	}

	if (currentTree !== undefined && sequencedEdits !== undefined) {
		// TODO:#45414: Add more robust validation of the summary's fields. Even if they are present, they may be malformed.
		return { currentTree, sequencedEdits, version };
	}

	return 'Missing fields on summary';
}

/**
 * Preserves the full history in the generated summary.
 * @public
 */
export function fullHistorySummarizer(sequencedEdits: OrderedEditSet, currentView: Snapshot): SharedTreeSummary {
	const edits = Array.from(sequencedEdits);
	return {
		currentTree: currentView.getChangeNodeTree(),
		sequencedEdits: edits,
		version: formatVersion,
	};
}

/**
 * Does not preserve (persist) history at all.
 * Instead, the history returned in the summary will contain a single change that creates a revision identical to the supplied view.
 * @public
 */
export function noHistorySummarizer(_: OrderedEditSet, currentView: Snapshot): SharedTreeSummary {
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
	return {
		version: formatVersion,
		sequencedEdits: [newEdit(changes)],
		currentTree,
	};
}
