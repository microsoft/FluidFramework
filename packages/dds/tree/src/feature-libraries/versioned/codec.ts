/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { TSchema } from "@sinclair/typebox";
import { ICodecOptions, IJsonCodec, withSchemaValidation } from "../../codec";
import { JsonCompatibleReadOnly } from "../../util";
import { Versioned } from "./format";

export function makeVersionedCodec<
	TDecoded,
	TEncoded extends Versioned = JsonCompatibleReadOnly & Versioned,
	TValidate = TEncoded,
>(
	supportedVersions: Set<number>,
	{ jsonValidator: validator }: ICodecOptions,
	inner: IJsonCodec<TDecoded, TEncoded, TValidate>,
): IJsonCodec<TDecoded, TEncoded, TValidate> {
	return withSchemaValidation(
		Versioned,
		{
			encode: (data: TDecoded): TEncoded => {
				const encoded = inner.encode(data);
				assert(
					supportedVersions.has(encoded.version),
					"version being encoded should be supported",
				);
				return encoded;
			},
			decode: (data: TValidate): TDecoded => {
				const versioned = data as Versioned; // Validated by withSchemaValidation
				assert(
					supportedVersions.has(versioned.version),
					"version being decoded is not supported",
				);
				const decoded = inner.decode(data);
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
>(
	options: ICodecOptions,
	supportedVersions: Set<number>,
	schema: EncodedSchema,
	codec: IJsonCodec<TDecoded, TEncoded, TValidate>,
): IJsonCodec<TDecoded, TEncoded, TValidate> {
	return makeVersionedCodec(
		supportedVersions,
		options,
		withSchemaValidation(schema, codec, options.jsonValidator),
	);
}
