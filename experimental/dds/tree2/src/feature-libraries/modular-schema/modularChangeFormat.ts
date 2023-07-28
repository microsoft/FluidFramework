/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ObjectOptions, Static, Type } from "@sinclair/typebox";
import {
	ChangesetLocalId,
	FieldKindIdentifierSchema,
	GlobalFieldKeySchema,
	LocalFieldKeySchema,
	RevisionTagSchema,
} from "../../core";
import {
	brandedNumberType,
	JsonCompatibleReadOnly,
	JsonCompatibleReadOnlySchema,
} from "../../util";

const noAdditionalProps: ObjectOptions = { additionalProperties: false };

export const ChangesetLocalIdSchema = brandedNumberType<ChangesetLocalId>();

export const EncodedChangeAtomId = Type.Object(
	{
		/**
		 * Uniquely identifies the changeset within which the change was made.
		 */
		revision: Type.Union([RevisionTagSchema, Type.Undefined()]),
		/**
		 * Uniquely identifies, in the scope of the changeset, the change made to the field.
		 */
		localId: ChangesetLocalIdSchema,
	},
	noAdditionalProps,
);

const EncodedValueChange = Type.Object(
	{
		revision: Type.Optional(RevisionTagSchema),
		value: Type.Optional(JsonCompatibleReadOnlySchema),
	},
	noAdditionalProps,
);
type EncodedValueChange = Static<typeof EncodedValueChange>;

const EncodedValueConstraint = Type.Object(
	{
		value: Type.Optional(JsonCompatibleReadOnlySchema),
		violated: Type.Boolean(),
	},
	noAdditionalProps,
);
type EncodedValueConstraint = Static<typeof EncodedValueConstraint>;

const EncodedFieldChange = Type.Object(
	{
		fieldKey: Type.Union([LocalFieldKeySchema, GlobalFieldKeySchema]),
		keyIsGlobal: Type.Boolean(),
		fieldKind: FieldKindIdentifierSchema,
		// Implementation note: node and field change encoding is mutually recursive.
		// This field marks a boundary in that recursion to avoid constructing excessively complex
		// recursive types. Encoded changes are validated at this boundary at runtime--see modularChangeCodecs.ts.
		change: JsonCompatibleReadOnlySchema,
	},
	noAdditionalProps,
);

export interface EncodedFieldChange extends Static<typeof EncodedFieldChange> {
	/**
	 * Encoded in format selected by `fieldKind`
	 */
	change: JsonCompatibleReadOnly;
}

const EncodedFieldChangeMap = Type.Array(EncodedFieldChange);

/**
 * Format for encoding as json.
 *
 * This chooses to use lists of named objects instead of maps:
 * this choice is somewhat arbitrary, but avoids user data being used as object keys,
 * which can sometimes be an issue (for example handling that for "__proto__" can require care).
 * It also allows dealing with global vs local field key disambiguation via a flag on the field.
 */
export type EncodedFieldChangeMap = Static<typeof EncodedFieldChangeMap>;

const EncodedNodeExistsConstraint = Type.Object({
	violated: Type.Boolean(),
});
type EncodedNodeExistsConstraint = Static<typeof EncodedNodeExistsConstraint>;

export const EncodedNodeChangeset = Type.Object(
	{
		valueChange: Type.Optional(EncodedValueChange),
		fieldChanges: Type.Optional(EncodedFieldChangeMap),
		valueConstraint: Type.Optional(EncodedValueConstraint),
		nodeExistsConstraint: Type.Optional(EncodedNodeExistsConstraint),
	},
	noAdditionalProps,
);

/**
 * Format for encoding as json.
 */
export type EncodedNodeChangeset = Static<typeof EncodedNodeChangeset>;

const EncodedRevisionInfo = Type.Object(
	{
		revision: Type.Readonly(RevisionTagSchema),
		rollbackOf: Type.ReadonlyOptional(RevisionTagSchema),
	},
	noAdditionalProps,
);

export const EncodedModularChangeset = Type.Object(
	{
		maxId: Type.Optional(ChangesetLocalIdSchema),
		changes: EncodedFieldChangeMap,
		revisions: Type.ReadonlyOptional(Type.Array(EncodedRevisionInfo)),
	},
	noAdditionalProps,
);

export type EncodedModularChangeset = Static<typeof EncodedModularChangeset>;
