/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type ChangeAtomId, Multiplicity } from "../../core/index.js";
import { requiredIdentifier, identifierFieldIdentifier } from "../fieldKindIdentifiers.js";
import {
	type FieldEditor,
	type FieldChangeHandler,
	FlexFieldKind,
} from "../modular-schema/index.js";
import { optionalChangeHandler, optionalFieldEditor } from "./optionalField.js";
import type { OptionalChangeset } from "./optionalFieldChangeTypes.js";

// Required fields are a restricted version of optional fields that must always contain a value.
// Because of this, the implementation of required fields lives here, inside optional.
// This avoids having to export optional field implementation details which are only used by required.

/**
 * {@link FieldEditor} for required fields (always contain exactly 1 child).
 * @remarks
 * This shares code with optional fields, since they are the same edit wise except setting to empty is not allowed,
 * and the content is always assumed to not be empty.
 * This means the actual edits implemented for optional fields are sufficient to support required fields
 * which is why this is defined and implemented in terms of optional fields.
 */
export interface RequiredFieldEditor extends FieldEditor<OptionalChangeset> {
	/**
	 * Creates a change which replaces the current value of the field with `newValue`.
	 * @param ids - The ids for the fill and detach fields.
	 */
	set(ids: { fill: ChangeAtomId; detach: ChangeAtomId }): OptionalChangeset;
}

export const requiredFieldEditor: RequiredFieldEditor = {
	...optionalFieldEditor,
	set: (ids: {
		fill: ChangeAtomId;
		detach: ChangeAtomId;
	}): OptionalChangeset => optionalFieldEditor.set(false, ids),
};

export const requiredFieldChangeHandler: FieldChangeHandler<
	OptionalChangeset,
	RequiredFieldEditor
> = {
	...optionalChangeHandler,
	editor: requiredFieldEditor,
};

/**
 * Exactly one item.
 */
export const required = new FlexFieldKind(requiredIdentifier, Multiplicity.Single, {
	changeHandler: requiredFieldChangeHandler,
	allowMonotonicUpgradeFrom: new Set([identifierFieldIdentifier]),
});
