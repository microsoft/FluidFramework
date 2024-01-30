/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { TSchema } from "@sinclair/typebox";
import { ICodecOptions, IJsonCodec, withSchemaValidation } from "../codec.js";
import { JsonCompatibleReadOnly } from "../../util/index.js";
import { Versioned } from "./format.js";

export function makeVersionedCodec<
	TDecoded,
	TEncoded extends Versioned = JsonCompatibleReadOnly & Versioned,
	TValidate = TEncoded,
	TContext = void,
>(
	supportedVersions: Set<number>,
	{ jsonValidator: validator }: ICodecOptions,
	inner: IJsonCodec<TDecoded, TEncoded, TValidate, TContext>,
): IJsonCodec<TDecoded, TEncoded, TValidate, TContext> {
	return withSchemaValidation(
		Versioned,
		{
			encode: (data: TDecoded, context: TContext): TEncoded => {
				const encoded = inner.encode(data, context);
				assert(
					supportedVersions.has(encoded.version),
					0x88b /* version being encoded should be supported */,
				);
				return encoded;
			},
			decode: (data: TValidate, context: TContext): TDecoded => {
				const versioned = data as Versioned; // Validated by withSchemaValidation
				assert(
					supportedVersions.has(versioned.version),
					0x88c /* version being decoded is not supported */,
				);
				const decoded = inner.decode(data, context);
				return decoded;
			},
		},
		validator,
	);
}

export function makeVersionedValidatedCodec<
	EncodedSchema extends TSchema,
	TDecoded,
	TEncoded extends Versioned = JsonCompatibleReadOnly & Versioned,
	TValidate = TEncoded,
	TContext = void,
>(
	options: ICodecOptions,
	supportedVersions: Set<number>,
	schema: EncodedSchema,
	codec: IJsonCodec<TDecoded, TEncoded, TValidate, TContext>,
): IJsonCodec<TDecoded, TEncoded, TValidate, TContext> {
	return makeVersionedCodec(
		supportedVersions,
		options,
		withSchemaValidation(schema, codec, options.jsonValidator),
	);
}
