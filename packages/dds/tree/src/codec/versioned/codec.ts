/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import {
	getConfigForMinVersionForCollab,
	type ConfigMapEntry,
	type SemanticVersion,
} from "@fluidframework/runtime-utils/internal";
import { Type, type TSchema } from "@sinclair/typebox";
import { gt } from "semver-ts";

import type { JsonCompatibleReadOnly } from "../../util/index.js";
import {
	type ICodecFamily,
	type ICodecOptions,
	type IJsonCodec,
	withSchemaValidation,
	type FormatVersion,
	type CodecWriteOptions,
	type IMultiFormatCodec,
	type CodecName,
	makeCodecFamily,
} from "../codec.js";

import { Versioned } from "./format.js";
import { pkgVersion } from "../../packageVersion.js";
import type { MinimumVersionForCollab } from "@fluidframework/runtime-definitions/internal";

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
The client which encoded this data likely specified an "minVersionForCollab" value which corresponds to a version newer than the version of this client ("${pkgVersion}").`,
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
	supportedVersions: Set<FormatVersion>,
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
 * Creates a codec which always throws a UsageError when encoding or decoding, indicating that the format version is discontinued.
 */
export function makeDiscontinuedCodecVersion<
	TDecoded,
	TEncoded extends Versioned = JsonCompatibleReadOnly & Versioned,
	TContext = unknown,
>(
	options: ICodecOptions,
	discontinuedVersion: FormatVersion,
	discontinuedSince: SemanticVersion,
): IJsonCodec<TDecoded, TEncoded, TEncoded, TContext> {
	const schema = Type.Object(
		{
			version:
				discontinuedVersion === undefined
					? Type.Undefined()
					: Type.Literal(discontinuedVersion),
		},
		// Using `additionalProperties: true` allows this schema to be used when loading data encoded by older versions even though they contain additional properties.
		{ additionalProperties: true },
	);
	const codec: IJsonCodec<TDecoded, TEncoded, TEncoded, TContext> = {
		encode: (_: TDecoded): TEncoded => {
			throw new UsageError(
				`Cannot encode data to format ${discontinuedVersion}. The codec was discontinued in Fluid Framework client version ${discontinuedSince}.`,
			);
		},
		decode: (data: TEncoded): TDecoded => {
			throw new UsageError(
				`Cannot decode data to format ${data.version}. The codec was discontinued in Fluid Framework client version ${discontinuedSince}.`,
			);
		},
	};
	return makeVersionedValidatedCodec(options, new Set([discontinuedVersion]), schema, codec);
}

/**
 * Creates a codec which dispatches to the appropriate member of a codec family based on the version of
 * data it encounters.
 * @remarks
 * Each member of the codec family must write an explicit version number into the data it encodes (implementing {@link Versioned}).
 *
 * @deprecated Users of this should migrate to {@link ClientVersionDispatchingCodecBuilder} so that the actual format version used can be encapsulated.
 */
export function makeVersionDispatchingCodec<TDecoded, TContext>(
	family: ICodecFamily<TDecoded, TContext>,
	options: ICodecOptions & { writeVersion: FormatVersion },
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

export type CodecType<TDecoded, TContext> =
	| IMultiFormatCodec<TDecoded, JsonCompatibleReadOnly, JsonCompatibleReadOnly, TContext>
	| IJsonCodec<TDecoded, JsonCompatibleReadOnly, JsonCompatibleReadOnly, TContext>;

export interface CodecVersion<TDecoded, TContext, TFormatVersion extends FormatVersion> {
	readonly formatVersion: TFormatVersion;
	readonly codec:
		| CodecType<TDecoded, TContext>
		| ((options: CodecWriteOptions) => CodecType<TDecoded, TContext>);
}

/**
 * Creates a codec which dispatches to the appropriate member of a codec family based on the `oldestCompatibleClient` for encode and the
 * version number in data it encounters for decode.
 * @privateRemarks
 * This is a two stage builder so the first stage can encapsulate all codec specific details and the second can bring in configuration.
 */
export class ClientVersionDispatchingCodecBuilder<
	Name extends CodecName,
	TDecoded,
	TContext,
	TFormatVersion extends FormatVersion,
> {
	private readonly fromFormatVersion: ReadonlyMap<
		FormatVersion,
		CodecVersion<TDecoded, TContext, TFormatVersion>
	>;

	private readonly minVersionFromCodec: ReadonlyMap<
		CodecVersion<TDecoded, TContext, TFormatVersion>,
		MinimumVersionForCollab
	>;

	public constructor(
		/**
		 * See {@link CodecName}.
		 */
		public readonly name: Name,
		/**
		 * The registry of codecs which this builder can use to encode and decode data.
		 */
		public readonly registry: ConfigMapEntry<CodecVersion<TDecoded, TContext, TFormatVersion>>,
	) {
		const fromFormatVersion: Map<
			FormatVersion,
			CodecVersion<TDecoded, TContext, TFormatVersion>
		> = new Map();
		const minVersionFromCodec: Map<
			CodecVersion<TDecoded, TContext, TFormatVersion>,
			MinimumVersionForCollab
		> = new Map();

		for (const [minVersionForCollab, codec] of Object.entries(registry)) {
			fromFormatVersion.set(codec.formatVersion, codec);
			minVersionFromCodec.set(codec, minVersionForCollab as MinimumVersionForCollab);
		}

		this.registry = registry;
		this.fromFormatVersion = fromFormatVersion;
		this.minVersionFromCodec = minVersionFromCodec;
	}

	private getWriteVersion(options: CodecWriteOptions): FormatVersion {
		if (options.writeVersionOverrides?.has(this.name) === true) {
			const selectedFormatVersion = options.writeVersionOverrides.get(this.name);
			const selected = this.fromFormatVersion.get(selectedFormatVersion);
			if (selected === undefined) {
				throw new UsageError(
					`Codec "${this.name}" does not support requested format version ${selectedFormatVersion}. Supported versions are: ${Array.from(
						this.fromFormatVersion.keys(),
					).join(", ")}.`,
				);
			} else if (options.allowPossiblyIncompatibleWriteVersionOverrides !== true) {
				const selectedMinVersionForCollab = this.minVersionFromCodec.get(selected);
				if (selectedMinVersionForCollab === undefined) {
					throw new UsageError(
						`Codec "${this.name}" does not support requested format version ${selectedFormatVersion} because it does not specify an oldest compatible client. Use "allowPossiblyIncompatibleWriteVersionOverrides" to override this error.`,
					);
				} else if (gt(selectedMinVersionForCollab, options.minVersionForCollab)) {
					throw new UsageError(
						`Codec "${this.name}" does not support requested format version ${selectedFormatVersion} because it is only compatible back to client version ${selectedMinVersionForCollab} and the requested oldest compatible client was ${options.minVersionForCollab}. Use "allowPossiblyIncompatibleWriteVersionOverrides" to override this error.`,
					);
				}
			}

			return options.writeVersionOverrides.get(this.name);
		}
		return getConfigForMinVersionForCollab(options.minVersionForCollab, this.registry)
			.formatVersion;
	}

	/**
	 * Generate the codec family for this builder.
	 * @remarks
	 * This is used by {@link build}, and only exposed to enable inspection and testing of this codec.
	 */
	public getFamily(options: CodecWriteOptions): ICodecFamily<TDecoded, TContext> {
		const family = makeCodecFamily(
			Object.values(this.registry).map(
				(codec: CodecVersion<TDecoded, TContext, TFormatVersion>) => {
					const final = typeof codec.codec === "function" ? codec.codec(options) : codec.codec;
					return [codec.formatVersion, final];
				},
			),
		);
		return family;
	}

	public build(
		options: CodecWriteOptions,
	): IJsonCodec<TDecoded, JsonCompatibleReadOnly, JsonCompatibleReadOnly, TContext> {
		const family = this.getFamily(options);
		const writeVersion = this.getWriteVersion(options);
		return makeVersionDispatchingCodec(family, { ...options, writeVersion });
	}
}
