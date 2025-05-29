/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import type { TSchema } from "@sinclair/typebox";

import type { JsonCompatibleReadOnly } from "../../util/index.js";
import {
	type ICodecFamily,
	type ICodecOptions,
	type IJsonCodec,
	withSchemaValidation,
	type FormatVersion,
	type FluidClientVersion,
	type CodecWriteOptions,
} from "../codec.js";

import { Versioned } from "./format.js";
import { pkgVersion } from "../../packageVersion.js";

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
			if (!supportedVersions.has(versioned.version)) {
				throw new UsageError(
					`Unsupported version ${versioned.version} encountered while decoding data. Supported versions for this data are: ${Array.from(supportedVersions).join(", ")}.
The client which encoded this data likely specified an "oldestCompatibleClient" value which corresponds to a version newer than the version of this client ("${pkgVersion}").`,
				);
			}
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
 * @remarks
 * Each member of the codec family must write an explicit version number into the data it encodes (implementing {@link Versioned}).
 *
 * TODO: Users of this should migrate to {@link ClientVersionDispatchingCodecBuilder} so that the actual format version used can be encapsulated.
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

/**
 * Creates a codec which dispatches to the appropriate member of a codec family based on the `oldestCompatibleClient` for encode and the
 * version number in data it encounters for decode.
 * @privateRemarks
 * This is a two stage builder so the first stage can encapsulate all codec specific details and the second can bring in configuration.
 */
export class ClientVersionDispatchingCodecBuilder<TDecoded, TContext> {
	public constructor(
		/**
		 * The codec family to dispatch to.
		 */
		private readonly family: ICodecFamily<TDecoded, TContext>,
		/**
		 * A function which maps a {@link FluidClientVersion} to a version number for the codec family which is supported by that version.
		 * This can (and typically does) pick the newest version of the codec which is known to be compatible with the client version so that
		 * any improvements in newer versions of the codec can be used when allowed.
		 */
		private readonly versionMapping: (oldestCompatibleClient: FluidClientVersion) => number,
	) {}

	public build(
		options: CodecWriteOptions,
	): IJsonCodec<TDecoded, JsonCompatibleReadOnly, JsonCompatibleReadOnly, TContext> {
		const writeVersion = this.versionMapping(options.oldestCompatibleClient);
		return makeVersionDispatchingCodec(this.family, { ...options, writeVersion });
	}
}
