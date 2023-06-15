/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Static, TSchema, Type } from "@sinclair/typebox";
import { EncodedJsonableTree, RevisionTagSchema } from "../core";
import { ChangesetLocalIdSchema } from "./modular-schema";

export const EncodedNodeUpdate = <Schema extends TSchema>(tNodeChange: Schema) =>
	Type.Union([
		Type.Object({
			set: EncodedJsonableTree,
			changes: Type.Optional(tNodeChange),
		}),
		Type.Object({
			/**
			 * The node being restored.
			 */
			revert: EncodedJsonableTree,
			revision: Type.Optional(RevisionTagSchema),
			changes: Type.Optional(tNodeChange),
		}),
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
	public encodedValueChangeset(e: T) {
		return EncodedValueChangeset<T>(e);
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

export const EncodedValueChangeset = <Schema extends TSchema>(tNodeChange: Schema) =>
	Type.Object({
		value: Type.Optional(EncodedNodeUpdate(tNodeChange)),
		changes: Type.Optional(tNodeChange),
	});

export type EncodedValueChangeset<Schema extends TSchema> = Static<
	ReturnType<Wrapper<Schema>["encodedValueChangeset"]>
>;

export const EncodedOptionalFieldChange = <Schema extends TSchema>(tNodeChange: Schema) =>
	Type.Object({
		/**
		 * Uniquely identifies, in the scope of the changeset, the change made to the field.
		 */
		id: ChangesetLocalIdSchema,
		/**
		 * The new content for the trait. If undefined, the trait will be cleared.
		 */
		newContent: Type.Optional(EncodedNodeUpdate(tNodeChange)),
		/**
		 * Whether the field was empty in the state this change is based on.
		 */
		wasEmpty: Type.Boolean(),
	});

export type EncodedOptionalFieldChange<Schema extends TSchema> = Static<
	ReturnType<Wrapper<Schema>["encodedOptionalFieldChange"]>
>;

export const EncodedOptionalChangeset = <Schema extends TSchema>(tNodeChange: Schema) =>
	Type.Object({
		fieldChange: Type.Optional(EncodedOptionalFieldChange(tNodeChange)),
		childChange: Type.Optional(tNodeChange),
	});

export type EncodedOptionalChangeset<Schema extends TSchema> = Static<
	ReturnType<Wrapper<Schema>["encodedOptionalChangeset"]>
>;
