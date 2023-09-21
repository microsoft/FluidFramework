/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Static, ObjectOptions, TSchema, Type } from "@sinclair/typebox";
import { EncodedJsonableTree, RevisionTagSchema } from "../../core";
import { ChangesetLocalIdSchema, EncodedChangeAtomId } from "../modular-schema";

const noAdditionalProps: ObjectOptions = { additionalProperties: false };

export const EncodedNodeUpdate = <Schema extends TSchema>(tNodeChange: Schema) =>
	Type.Union([
		Type.Object(
			{
				set: EncodedJsonableTree,
				changes: Type.Optional(tNodeChange),
			},
			noAdditionalProps,
		),
		Type.Object(
			{
				/**
				 * The node being restored.
				 */
				revert: EncodedJsonableTree,
				changeId: EncodedChangeAtomId,
				changes: Type.Optional(tNodeChange),
			},
			noAdditionalProps,
		),
	]);

/**
 * Note: TS doesn't easily support extracting a generic function's return type until 4.7:
 * https://github.com/microsoft/TypeScript/pull/47607
 * This type is a workaround and can be removed once we're on a version of typescript which
 * supports expressions more like:
 * `Static<ReturnType<typeof EncodedNodeUpdate<Schema>>>`
 */
class Wrapper<T extends TSchema> {
	public encodedNodeUpdate(e: T) {
		return EncodedNodeUpdate<T>(e);
	}
	public encodedOptionalFieldChange(e: T) {
		return EncodedOptionalFieldChange<T>(e);
	}
	public encodedOptionalChangeset(e: T) {
		return EncodedOptionalChangeset<T>(e);
	}
}

export type EncodedNodeUpdate<Schema extends TSchema> = Static<
	ReturnType<Wrapper<Schema>["encodedNodeUpdate"]>
>;

export const EncodedOptionalFieldChange = <Schema extends TSchema>(tNodeChange: Schema) =>
	Type.Object(
		{
			/**
			 * Uniquely identifies, in the scope of the changeset, the change made to the field.
			 * Globally unique across all changesets when paired with the changeset's revision tag.
			 */
			id: ChangesetLocalIdSchema,
			/**
			 * When populated, indicates the revision that this field change is associated with.
			 * Is left undefined when the revision is the same as that of the whole changeset
			 * (which would also be undefined in the case of an anonymous changeset).
			 */
			revision: Type.Optional(RevisionTagSchema),
			/**
			 * The new content for the trait. If undefined, the trait will be cleared.
			 */
			newContent: Type.Optional(EncodedNodeUpdate(tNodeChange)),
			/**
			 * Whether the field was empty in the state this change is based on.
			 */
			wasEmpty: Type.Boolean(),
		},
		noAdditionalProps,
	);

type EncodedOptionalFieldChange<Schema extends TSchema> = Static<
	ReturnType<Wrapper<Schema>["encodedOptionalFieldChange"]>
>;

export const EncodedOptionalChangeset = <Schema extends TSchema>(tNodeChange: Schema) =>
	Type.Object(
		{
			fieldChange: Type.Optional(EncodedOptionalFieldChange(tNodeChange)),
			childChanges: Type.Optional(
				Type.Array(
					Type.Tuple([
						Type.Union([EncodedChangeAtomId, Type.Literal("self")]),
						tNodeChange,
					]),
				),
			),
		},
		noAdditionalProps,
	);

export type EncodedOptionalChangeset<Schema extends TSchema> = Static<
	ReturnType<Wrapper<Schema>["encodedOptionalChangeset"]>
>;
