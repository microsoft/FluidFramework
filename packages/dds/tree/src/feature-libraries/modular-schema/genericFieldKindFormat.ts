/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Many of the return types in this module are intentionally derived, rather than explicitly specified.
/* eslint-disable @typescript-eslint/explicit-function-return-type */

import { type Static, type TAnySchema, type TSchema, Array as _typebox_Array, Number as _typebox_Number, Tuple as _typebox_Tuple } from "@sinclair/typebox";
const Type = { Array: _typebox_Array, Number: _typebox_Number, Tuple: _typebox_Tuple };

export const EncodedGenericChange = <NodeChangesetSchema extends TSchema>(
	tNodeChangeset: NodeChangesetSchema,
) => Type.Tuple([Type.Number({ minimum: 0, multipleOf: 1 }), tNodeChangeset]);

export type EncodedGenericChange<Schema extends TSchema = TAnySchema> = Static<
	ReturnType<typeof EncodedGenericChange<Schema>>
>;

export const EncodedGenericChangeset = <NodeChangesetSchema extends TSchema>(
	tNodeChangeset: NodeChangesetSchema,
) => Type.Array(EncodedGenericChange(tNodeChangeset));

export type EncodedGenericChangeset<Schema extends TSchema = TAnySchema> = Static<
	ReturnType<typeof EncodedGenericChangeset<Schema>>
>;
