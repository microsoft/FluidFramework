/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Static, Type } from "@sinclair/typebox";
import { EncodedJsonableTree, RevisionTag } from "../core";
// TODO: Resolve uses of JsonCompatibleReadonly, consider making this take in the child type at the schema level. (TSchema)
import { JsonCompatibleReadOnly } from "../util";

export const EncodedNodeUpdate = Type.Union([
	Type.Object({
		set: EncodedJsonableTree,
		changes: Type.Optional(JsonCompatibleReadOnly),
	}),
	Type.Object({
		/**
		 * The node being restored.
		 */
		revert: EncodedJsonableTree,
		revision: Type.Optional(RevisionTag),
		changes: Type.Optional(JsonCompatibleReadOnly),
	}),
]);
export type EncodedNodeUpdate = Static<typeof EncodedNodeUpdate>;

export const EncodedValueChangeset = Type.Object({
	value: Type.Optional(EncodedNodeUpdate),
	changes: Type.Optional(JsonCompatibleReadOnly),
});

export type EncodedValueChangeset = Static<typeof EncodedValueChangeset>;

export const EncodedOptionalFieldChange = Type.Object({
	/**
	 * The new content for the trait. If undefined, the trait will be cleared.
	 */
	newContent: Type.Optional(EncodedNodeUpdate),
	/**
	 * Whether the field was empty in the state this change is based on.
	 */
	wasEmpty: Type.Boolean(),
});

export type EncodedOptionalFieldChange = Static<typeof EncodedOptionalFieldChange>;

export const EncodedOptionalChangeset = Type.Object({
	fieldChange: Type.Optional(EncodedOptionalFieldChange),
	childChange: Type.Optional(JsonCompatibleReadOnly),
});

export type EncodedOptionalChangeset = Static<typeof EncodedOptionalChangeset>;
