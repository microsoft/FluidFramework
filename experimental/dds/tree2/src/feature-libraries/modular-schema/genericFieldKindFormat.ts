/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Static, Type, TSchema, TAnySchema } from "@sinclair/typebox";

/**
 * Note: TS doesn't easily support extracting a generic function's return type until 4.7:
 * https://github.com/microsoft/TypeScript/pull/47607
 * This type is a workaround and can be removed once we're on a version of typescript which
 * supports expressions more like:
 * `Static<ReturnType<typeof EncodedGenericChange<Schema>>>`
 */
class Wrapper<T extends TSchema> {
	public encodedGenericChange(e: T) {
		return EncodedGenericChange<T>(e);
	}
	public encodedGenericChangeset(e: T) {
		return EncodedGenericChangeset<T>(e);
	}
}

export const EncodedGenericChange = <NodeChangesetSchema extends TSchema>(
	tNodeChangeset: NodeChangesetSchema,
) =>
	Type.Object({
		index: Type.Number({ minimum: 0 }),
		nodeChange: tNodeChangeset,
	});

export type EncodedGenericChange<Schema extends TSchema = TAnySchema> = Static<
	ReturnType<Wrapper<Schema>["encodedGenericChange"]>
>;

export const EncodedGenericChangeset = <NodeChangesetSchema extends TSchema>(
	tNodeChangeset: NodeChangesetSchema,
) => Type.Array(EncodedGenericChange(tNodeChangeset));

export type EncodedGenericChangeset<Schema extends TSchema = TAnySchema> = Static<
	ReturnType<Wrapper<Schema>["encodedGenericChangeset"]>
>;
