/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { v4 as uuidv4 } from 'uuid';
import { DetachedSequenceId, EditId } from './Identifiers';
import { Edit, TreeNodeSequence, EditNode, Change, StableRange, TraitLocation } from './PersistedTypes';

/**
 * Functions for constructing and comparing Edits.
 */

/**
 * Returns true if the provided Edits have equivalent properties.
 */
export function compareEdits(editIdA: EditId, editIdB: EditId): boolean {
	// TODO #45414: We should also be deep comparing the list of changes in the edit. This is not straightforward.
	// We can use our edit validation code when we write it since it will need to do deep walks of the changes.
	return editIdA === editIdB;
}

/**
 * Check if two TraitLocations are equal.
 */
export function compareTraits(traitA: TraitLocation, traitB: TraitLocation): boolean {
	if (traitA.label !== traitB.label || traitA.parent !== traitB.parent) {
		return false;
	}

	return true;
}

/**
 * Create a sequence of changes that resets the contents of `trait`.
 * @public
 */
export function setTrait(trait: TraitLocation, nodes: TreeNodeSequence<EditNode>): readonly Change[] {
	const id = 0 as DetachedSequenceId;
	const traitContents = StableRange.all(trait);

	return [Change.detach(traitContents), Change.build(nodes, id), Change.insert(id, traitContents.start)];
}

/**
 * Generates a new edit object from the supplied changes.
 */
export function newEdit(changes: readonly Change[]): Edit {
	return { id: newEditId(), changes };
}

/**
 * Generates a new edit object from the supplied changes.
 */
export function newEditId(): EditId {
	return uuidv4() as EditId;
}

/**
 * Determine if an EditNode is a DetachedSequenceId.
 * @internal
 */
export function isDetachedSequenceId(node: EditNode): node is DetachedSequenceId {
	return typeof node !== 'object';
}
