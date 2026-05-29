/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type Static, type TSchema, Array as _typebox_Array, Object as _typebox_Object, Optional as _typebox_Optional } from "@sinclair/typebox";
const Type = { Array: _typebox_Array, Object: _typebox_Object, Optional: _typebox_Optional };

import type { EncodedSchemaChange } from "../feature-libraries/index.js";
import { JsonCompatibleReadOnlySchema } from "../util/index.js";

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function EncodedSharedTreeInnerChange<TEncodedSchema extends TSchema>(
	encodedSchemaSchema: TEncodedSchema,
) {
	return Type.Object({
		schema: Type.Optional(encodedSchemaSchema),
		data: Type.Optional(JsonCompatibleReadOnlySchema),
	});
}

export type EncodedSharedTreeInnerChange<
	TEncodedSchema extends TSchema = typeof EncodedSchemaChange,
> = Static<ReturnType<typeof EncodedSharedTreeInnerChange<TEncodedSchema>>>;

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function EncodedSharedTreeChange<TEncodedSchema extends TSchema>(
	encodedSchemaSchema: TEncodedSchema,
) {
	return Type.Array(EncodedSharedTreeInnerChange(encodedSchemaSchema));
}

export type EncodedSharedTreeChange<
	TEncodedSchema extends TSchema = typeof EncodedSchemaChange,
> = Static<ReturnType<typeof EncodedSharedTreeChange<TEncodedSchema>>>;
