/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { v4 as uuidv4 } from 'uuid';
import { EditId } from '../Identifiers';
import { Edit, TraitLocation } from './PersistedTypes';

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
 * Generates a new edit object from the supplied changes.
 */
export function newEdit<TEdit>(changes: readonly TEdit[]): Edit<TEdit> {
	return { id: newEditId(), changes };
}

/**
 * Generates a new edit object from the supplied changes.
 */
export function newEditId(): EditId {
	return uuidv4() as EditId;
}
