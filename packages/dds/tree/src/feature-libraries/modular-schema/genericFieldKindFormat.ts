/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type Static, type TAnySchema, type TSchema, Type } from "@sinclair/typebox";

// Many of the return types in this module are intentionally derived, rather than explicitly specified.
/* eslint-disable @typescript-eslint/explicit-function-return-type */

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
) => Type.Tuple([Type.Number({ minimum: 0, multipleOf: 1 }), tNodeChangeset]);

export type EncodedGenericChange<Schema extends TSchema = TAnySchema> = Static<
	ReturnType<Wrapper<Schema>["encodedGenericChange"]>
>;

export const EncodedGenericChangeset = <NodeChangesetSchema extends TSchema>(
	tNodeChangeset: NodeChangesetSchema,
) => Type.Array(EncodedGenericChange(tNodeChangeset));

export type EncodedGenericChangeset<Schema extends TSchema = TAnySchema> = Static<
	ReturnType<Wrapper<Schema>["encodedGenericChangeset"]>
>;

/* eslint-enable @typescript-eslint/explicit-function-return-type */
