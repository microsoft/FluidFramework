/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { v4 as uuidv4 } from 'uuid';
import { assert, compareArrays } from './Common';
import { DetachedSequenceId, EditId } from './Identifiers';
import { Edit, TreeNodeSequence, EditNode, ChangeNode, Change, StableRange, TraitLocation } from './PersistedTypes';

/**
 * Functions for constructing and comparing Edits.
 */

/**
 * Returns true if the provided Edits have equivalent properties.
 */
export function compareEdits(editA: Edit, editB: Edit): boolean {
	// TODO #45414: We should also be deep comparing the list of changes in the edit. This is not straightforward.
	// We can use our edit validation code when we write it since it will need to do deep walks of the changes.
	return editA.id === editB.id;
}

/**
 * Check if two trees are equivalent, meaning they have the same descendants with the same properties.
 */
export function deepCompareNodes(a: ChangeNode, b: ChangeNode): boolean {
	if (a.identifier !== b.identifier) {
		return false;
	}

	if (a.definition !== b.definition) {
		return false;
	}

	if (a.payload) {
		assert(a.payload.base64, 'deepCompareNodes only supports base64 payloads');
	}

	if (b.payload) {
		assert(b.payload.base64, 'deepCompareNodes only supports base64 payloads');
	}

	if (a.payload?.base64 !== b.payload?.base64) {
		return false;
	}

	const traitsA = Object.entries(a.traits);
	const traitsB = Object.entries(b.traits);

	if (traitsA.length !== traitsB.length) {
		return false;
	}

	for (let i = 0; i < traitsA.length; i++) {
		const [traitLabelA, childrenA] = traitsA[i];
		const [traitLabelB, childrenB] = traitsB[i];
		if (traitLabelA !== traitLabelB) {
			return false;
		}

		if (childrenA.length !== childrenB.length) {
			return false;
		}

		const traitsEqual = compareArrays(childrenA, childrenB, (childA, childB) => {
			if (typeof childA === 'number' || typeof childB === 'number') {
				// Check if children are DetachedSequenceIds
				return childA === childB;
			}

			return deepCompareNodes(childA, childB);
		});

		if (!traitsEqual) {
			return false;
		}
	}

	return true;
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
	return { id: uuidv4() as EditId, changes };
}
