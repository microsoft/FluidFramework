/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import type { TSchema } from "@sinclair/typebox";

import type { JsonCompatibleReadOnly } from "../../util/index.js";
import {
	type ICodecFamily,
	type ICodecOptions,
	type IJsonCodec,
	withSchemaValidation,
	type FormatVersion,
} from "../codec.js";

import { Versioned } from "./format.js";

export function makeVersionedCodec<
	TDecoded,
	TEncoded extends Versioned = JsonCompatibleReadOnly & Versioned,
	TValidate = TEncoded,
	TContext = void,
>(
	supportedVersions: Set<FormatVersion>,
	{ jsonValidator: validator }: ICodecOptions,
	inner: IJsonCodec<TDecoded, TEncoded, TValidate, TContext>,
): IJsonCodec<TDecoded, TEncoded, TValidate, TContext> {
	const codec = {
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
	};

	return supportedVersions.has(undefined)
		? codec
		: withSchemaValidation(Versioned, codec, validator);
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

/**
 * Creates a codec which dispatches to the appropriate member of a codec family based on the version of
 * data it encounters.
 * Each member of the codec family must write an explicit version number into the data it encodes.
 */
export function makeVersionDispatchingCodec<TDecoded, TContext>(
	family: ICodecFamily<TDecoded, TContext>,
	options: ICodecOptions & { writeVersion: number },
): IJsonCodec<TDecoded, JsonCompatibleReadOnly, JsonCompatibleReadOnly, TContext> {
	const writeCodec = family.resolve(options.writeVersion).json;
	const supportedVersions = new Set(family.getSupportedFormats());
	return makeVersionedCodec(supportedVersions, options, {
		encode(data, context): Versioned {
			return writeCodec.encode(data, context) as Versioned;
		},
		decode(data: Versioned, context) {
			const codec = family.resolve(data.version);
			return codec.json.decode(data, context);
		},
	});
}
