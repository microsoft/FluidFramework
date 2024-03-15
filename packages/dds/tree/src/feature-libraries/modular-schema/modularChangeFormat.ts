/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ObjectOptions, Static, Type } from "@sinclair/typebox";
import { ChangesetLocalId, RevisionTagSchema, schemaFormat } from "../../core/index.js";
import {
	JsonCompatibleReadOnly,
	JsonCompatibleReadOnlySchema,
	brandedNumberType,
} from "../../util/index.js";
import { EncodedFieldBatch } from "../chunked-forest/index.js";

const noAdditionalProps: ObjectOptions = { additionalProperties: false };

export const ChangesetLocalIdSchema = brandedNumberType<ChangesetLocalId>({
	multipleOf: 1,
});

export const EncodedChangeAtomId = Type.Union([
	Type.Tuple([ChangesetLocalIdSchema, RevisionTagSchema]),
	ChangesetLocalIdSchema,
]);

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
		fieldKey: schemaFormat.FieldKeySchema,
		fieldKind: schemaFormat.FieldKindIdentifierSchema,
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
 */
export type EncodedFieldChangeMap = Static<typeof EncodedFieldChangeMap>;

const EncodedNodeExistsConstraint = Type.Object(
	{
		violated: Type.Boolean(),
	},
	noAdditionalProps,
);
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

export const EncodedRevisionInfo = Type.Object(
	{
		revision: Type.Readonly(RevisionTagSchema),
		rollbackOf: Type.ReadonlyOptional(RevisionTagSchema),
	},
	noAdditionalProps,
);

export type EncodedRevisionInfo = Static<typeof EncodedRevisionInfo>;

/**
 * Index of field in an EncodedFieldBatch.
 */
export const EncodedTreeIndex = Type.Number({ multipleOf: 1, minimum: 0 });

export const CommitBuilds = Type.Array(
	Type.Tuple([
		// ID for first node
		ChangesetLocalIdSchema,
		// Index for a TreeChunk that represents all the nodes
		EncodedTreeIndex,
	]),
);
export type CommitBuilds = Static<typeof CommitBuilds>;

export const EncodedBuildsArray = Type.Array(
	Type.Union([
		Type.Tuple([CommitBuilds, RevisionTagSchema]),
		// Revision is omitted when undefined
		Type.Tuple([CommitBuilds]),
	]),
);

export type EncodedBuildsArray = Static<typeof EncodedBuildsArray>;

export const EncodedBuilds = Type.Object(
	{
		builds: EncodedBuildsArray,
		/**
		 * Fields indexed by the EncodedTreeIndexes above.
		 * TODO: Strongly typing this here may result in redundant schema validation of this data.
		 */
		trees: EncodedFieldBatch,
	},
	noAdditionalProps,
);

export type EncodedBuilds = Static<typeof EncodedBuilds>;

export const EncodedModularChangeset = Type.Object(
	{
		maxId: Type.Optional(ChangesetLocalIdSchema),
		changes: EncodedFieldChangeMap,
		revisions: Type.ReadonlyOptional(Type.Array(EncodedRevisionInfo)),
		builds: Type.Optional(EncodedBuilds),
		refreshers: Type.Optional(EncodedBuilds),
	},
	noAdditionalProps,
);

export type EncodedModularChangeset = Static<typeof EncodedModularChangeset>;
