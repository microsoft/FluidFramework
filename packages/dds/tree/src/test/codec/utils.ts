/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Static, TSchema } from "@sinclair/typebox";

import {
	type IJsonCodec,
	type JsonValidator,
	withSchemaValidation,
} from "../../codec/index.js";
import type { JsonCompatibleReadOnly } from "../../util/index.js";

/**
 * Creates a json codec for objects which are just a json compatible value
 * and can be serialized as-is.
 *
 * This type of encoding is only appropriate if the persisted type (which should be defined in a persisted format file)
 * happens to be convenient for in-memory usage as well.
 *
 * @remarks Beware that this API can cause accidental extraneous data in the persisted format.
 * Consider the following example:
 * ```typescript
 * interface MyPersistedType {
 *     foo: string;
 *     id: number;
 * }
 * const MyPersistedType = Type.Object({
 *     foo: Type.String(),
 *     id: Type.Number()
 * });
 *
 * const codec = makeValueCodec<MyPersistedType>();
 *
 * // Later, in some other file...
 * interface SomeInMemoryType extends MyPersistedType {
 *     someOtherProperty: string;
 * }
 *
 * const someInMemoryObject: SomeInMemoryType = {
 *     foo:	"bar",
 *     id: 0,
 *     someOtherProperty: "this shouldn't be here and ends up in the persisted format"
 * }
 *
 * const encoded = codec.encode(someInMemoryObject);
 * ```
 * This all typechecks and passes at runtime, but the persisted format will contain the extraneous
 * `someOtherProperty` field.
 * It's unlikely a real-life example would be this simple, but the principle is the same.
 *
 * This issue can be avoided by using JSON schema that doesn't accept additional properties:
 *
 * ```typescript
 * const MyPersistedType = Type.Object({
 *     foo: Type.String(),
 *     id: Type.Number()
 * }, {
 *     additionalProperties: false
 * });
 * ```
 */
export function makeValueCodec<Schema extends TSchema, TContext>(
	schema: Schema,
	validator?: JsonValidator,
): IJsonCodec<Static<Schema>, JsonCompatibleReadOnly, JsonCompatibleReadOnly, TContext> {
	return withSchemaValidation(
		schema,
		{
			encode: (x: Static<Schema>) => x as unknown as JsonCompatibleReadOnly,
			decode: (x: JsonCompatibleReadOnly) => x as unknown as Static<Schema>,
		},
		validator,
	);
}
