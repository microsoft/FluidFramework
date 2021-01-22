/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHandle, ISerializedHandle } from '@fluidframework/core-interfaces';
import { EditId, TraitLabel } from './Identifiers';
import { assert, assertNotUndefined } from './Common';
import { editsPerChunk, OrderedEditSet } from './EditLog';
import { newEdit, setTrait } from './EditUtilities';
import { ChangeNode, Edit, Change, EditWithoutId } from './PersistedTypes';
import { Snapshot } from './Snapshot';
import { initialTree } from './InitialTree';

/**
 * Format version for summaries which is supported.
 * Currently no effort is made to support older/newer documents, and any mismatch is an error.
 */
export const formatVersion = '0.0.2';

/**
 * Handler for summarizing the tree state.
 * The handler is invoked when saving a summary. It accepts a view of the current state of the tree, the sequenced edits known
 * to the SharedTree, and optional helpers for serializing the edit information.
 * @returns a summary of the supplied state.
 * @public
 */
export type SharedTreeSummarizer = (
	editLog: OrderedEditSet,
	currentView: Snapshot,
	serializationHelpers: SerializationHelpers
) => SharedTreeSummary;

/**
 * A developer facing (non-localized) error message.
 * TODO: better error system.
 */
export type ErrorString = string;

/**
 * The contents of a SharedTree summary: the current tree, and the edits needed to get from `initialTree` to the current tree.
 * @public
 */
export interface SharedTreeSummary {
	readonly currentTree: ChangeNode;

	/**
	 * A list of edits used on legacy format version 0.0.2.
	 * TODO:#49901: Remove when writing version 0.1.0
	 */
	readonly sequencedEdits?: readonly Edit[];

	/**
	 * Information that can populate an edit log.
	 */
	readonly editHistory?: SerializedEditLogSummary;

	/**
	 * Field on summary under which version is stored.
	 */
	readonly version: string;
}

/**
 * A serialized version of an edit log summary.
 * @public
 */
export interface SerializedEditLogSummary {
	/**
	 * A list of either handles corresponding to a chunk of edits or the edit chunk.
	 */
	readonly editChunks?: readonly (ISerializedHandle | EditWithoutId[])[];

	/**
	 * A list of edits IDs for all sequenced edits.
	 */
	readonly editIds: readonly EditId[];
}

/**
 * Helpers used to serialize summary fields.
 * @public
 */
export interface SerializationHelpers {
	serializeHandle: (handle: IFluidHandle<ArrayBufferLike>) => ISerializedHandle;
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

	const { version, currentTree } = summary;

	if (version !== undefined && currentTree !== undefined) {
		return { version, currentTree, ...summary };
	}

	return 'Missing fields on summary';
}

/**
 * Preserves the full history in the generated summary.
 * @public
 */
export function fullHistorySummarizer(
	editLog: OrderedEditSet,
	currentView: Snapshot,
	_serializationHelpers: SerializationHelpers
): SharedTreeSummary {
	const { editChunks, editIds } = editLog.getEditLogSummary();

	const sequencedEdits: Edit[] = [];
	editChunks.forEach((chunk, chunkIndex) => {
		assert(
			Array.isArray(chunk),
			'Handles should not be included in the summary until format version 0.1.0 is being written.'
		);

		chunk.forEach(({ changes }, editIndex) => {
			sequencedEdits.push({
				changes,
				id: assertNotUndefined(
					editIds[chunkIndex * editsPerChunk + editIndex],
					'Number of edits should match number of edit IDs.'
				),
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
 * Does not preserve (persist) history at all.
 * Instead, the history returned in the summary will contain a single change that creates a revision identical to the supplied view.
 * @public
 */
export function noHistorySummarizer(
	_editLog: OrderedEditSet,
	currentView: Snapshot,
	_serializationHelpers: SerializationHelpers
): SharedTreeSummary {
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
