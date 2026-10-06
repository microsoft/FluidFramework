/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, debugAssert } from "@fluidframework/core-utils/internal";
import type { OldestSupportedClientVersion } from "@fluidframework/runtime-definitions/internal";
import {
	getConfigForMinVersionForCollabIterable,
	lowestMinVersionForCollab,
	type MinimumMinorSemanticVersion,
	type SemanticVersion,
} from "@fluidframework/runtime-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import type { TSchema } from "@sinclair/typebox";
import { gt } from "semver-ts";

import { pkgVersion } from "../../packageVersion.js";
import {
	JsonCompatibleReadOnlySchema,
	type JsonCompatibleReadOnly,
	type JsonCompatibleReadOnlyObject,
	type UnionToIntersection,
} from "../../util/index.js";
import {
	type DecodeErrorHandler,
	type IDecoder,
	type ICodecOptions,
	type IJsonCodec,
	withSchemaValidation,
	type FormatVersion,
	type CodecWriteOptions,
	type CodecName,
	type CodecTree,
} from "../codec.js";

import { Versioned } from "./format.js";

/**
 * Json compatible data with a format version.
 */
type VersionedJson = JsonCompatibleReadOnlyObject & Versioned;

/**
 * Validate that the version is one of the supported values.
 * @remarks
 * If supportedVersions contains undefined, data with no version field is also accepted despite the return type indicating otherwise.
 * This is for legacy compatibility where older data may not have a version field.
 */
function makeVersionedCodec<
	TDecoded,
	TEncoded extends Versioned = VersionedJson,
	TValidate = TEncoded,
	TEncodeContext = void,
	TDecodeContext = TEncodeContext,
>(
	supportedVersions: Set<FormatVersion>,
	{ jsonValidator: validator }: ICodecOptions,
	inner: IJsonCodec<TDecoded, TEncoded, TValidate, TEncodeContext, TDecodeContext>,
): IJsonCodec<TDecoded, TEncoded, TValidate, TEncodeContext, TDecodeContext> {
	const codec = {
		encode: (data: TDecoded, context: TEncodeContext): TEncoded => {
			const encoded = inner.encode(data, context);
			assert(
				supportedVersions.has(encoded.version),
				0x88b /* version being encoded should be supported */,
			);
			return encoded;
		},
		decode: (
			data: TValidate,
			context: TDecodeContext,
			onError?: DecodeErrorHandler,
		): TDecoded => {
			const versioned = data as Versioned; // Validated by withSchemaValidation
			if (!supportedVersions.has(versioned.version)) {
				throw new UsageError(
					`Unsupported version ${versioned.version} encountered while decoding data. Supported versions for this data are: ${[...supportedVersions].join(", ")}.
The client which encoded this data likely specified an "minVersionForCollab" value which corresponds to a version newer than the version of this client ("${pkgVersion}").`,
				);
			}
			const decoded = inner.decode(data, context, onError);
			return decoded;
		},
	};

	// If undefined is a supported version, skip using withSchemaValidation to enforce there is a version field.
	// Codec will still assert the content of the field is in supportedVersions, so it is still somewhat validated, just in a different way.
	if (supportedVersions.has(undefined)) {
		return codec;
	}

	return withSchemaValidation(Versioned, codec, validator);
}

/**
 * Wrap a codec with version checking and schema validation.
 * @remarks
 * The passed in codec should not perform its own schema validation.
 * The schema validation gets added here.
 */
function makeVersionedValidatedCodec<
	EncodedSchema extends TSchema,
	TDecoded,
	TEncoded extends Versioned = VersionedJson,
	TValidate = TEncoded,
	TEncodeContext = void,
	TDecodeContext = TEncodeContext,
>(
	options: ICodecOptions,
	supportedVersions: Set<FormatVersion>,
	schema: EncodedSchema,
	codec: IJsonCodec<TDecoded, TEncoded, TValidate, TEncodeContext, TDecodeContext>,
): IJsonCodec<TDecoded, TEncoded, TValidate, TEncodeContext, TDecodeContext> &
	Pick<CodecAndSchema<TDecoded, TEncodeContext, TDecodeContext>, "schema"> {
	return {
		...makeVersionedCodec(
			supportedVersions,
			options,
			withSchemaValidation(schema, codec, options.jsonValidator),
		),
		schema,
	};
}

/**
 * A friendly format for codec authors use to define their codec and schema for use in {@link CodecVersion}.
 * @remarks
 * The codec should not perform its own schema validation.
 * The schema validation gets added when normalizing to {@link NormalizedCodecVersion}.
 */
export type CodecAndSchema<
	TDecoded,
	TEncodeContext = void,
	TDecodeContext = TEncodeContext,
> = {
	readonly schema: TSchema;
} & IJsonCodec<
	TDecoded,
	VersionedJson,
	JsonCompatibleReadOnly,
	TEncodeContext,
	TDecodeContext
>;

/**
 * A decoder and schema for a format which must not be used for encoding.
 *
 * @typeParam TDecoded - The in-memory data type produced by decoding.
 * @typeParam TDecodeContext - Context passed to decode operations.
 * @sealed
 */
export interface CodecAndSchemaReadonly<TDecoded, TDecodeContext = void>
	extends IDecoder<TDecoded, JsonCompatibleReadOnly, TDecodeContext> {
	/**
	 * Schema used to validate encoded data before decoding.
	 */
	readonly schema: TSchema;
	/**
	 * Read-only formats must not provide an encoder.
	 */
	readonly encode?: never;
}

/**
 * An encoder, decoder, and schema, supplied directly or built from codec options.
 */
type CodecSource<
	TDecoded,
	TEncodeContext,
	TBuildOptions extends ICodecOptions,
	TDecodeContext,
> =
	| CodecAndSchema<TDecoded, TEncodeContext, TDecodeContext>
	| ((options: TBuildOptions) => CodecAndSchema<TDecoded, TEncodeContext, TDecodeContext>);

/**
 * A decoder and schema, supplied directly or built from codec options.
 * No encoder is provided because the format is read-only.
 */
type ReadonlyCodecSource<TDecoded, TBuildOptions extends ICodecOptions, TDecodeContext> =
	| CodecAndSchemaReadonly<TDecoded, TDecodeContext>
	| ((options: TBuildOptions) => CodecAndSchemaReadonly<TDecoded, TDecodeContext>);

/**
 * A stable format which can be selected for encoding based on client compatibility.
 *
 * @typeParam TDecoded - The in-memory data type encoded and decoded by the codec.
 * @typeParam TEncodeContext - Context passed to encode operations.
 * @typeParam TFormatVersion - The numeric format identifier.
 * @typeParam TBuildOptions - Options used to build the codec.
 * @typeParam TDecodeContext - Context passed to decode operations.
 * @sealed
 */
export interface CodecVersionStable<
	TDecoded,
	TEncodeContext,
	TFormatVersion extends FormatVersion,
	TBuildOptions extends ICodecOptions = ICodecOptions,
	TDecodeContext = TEncodeContext,
> {
	/**
	 * Numeric identifier stored in data encoded with this stable format.
	 */
	readonly formatVersion: TFormatVersion & number;
	/**
	 * The oldest client version which supports this format.
	 */
	readonly minVersionForCollab: OldestSupportedClientVersion;
	/**
	 * The codec and schema for this format, or a factory which builds them from the codec options.
	 */
	readonly codec: CodecSource<TDecoded, TEncodeContext, TBuildOptions, TDecodeContext>;
}

/**
 * An experimental format which may be explicitly selected for encoding.
 *
 * @remarks
 * Experimental formats use string identifiers. They are never selected based on
 * {@link CodecWriteOptionsBeta.minVersionForCollab}.
 * They may be selected through a write-version override with
 * {@link CodecWriteOptionsBeta.allowPossiblyIncompatibleWriteVersionOverrides}, or by a
 * {@link VersionDispatchingCodecBuilderOptions.selectWriteFormatVersion} callback.
 *
 * Applications writing an experimental format are responsible for ensuring that every client
 * which loads or collaborates on the document supports that format.
 *
 * @typeParam TDecoded - The in-memory data type encoded and decoded by the codec.
 * @typeParam TEncodeContext - Context passed to encode operations.
 * @typeParam TFormatVersion - The string format identifier.
 * @typeParam TBuildOptions - Options used to build the codec.
 * @typeParam TDecodeContext - Context passed to decode operations.
 * @sealed
 */
export interface CodecVersionExperimental<
	TDecoded,
	TEncodeContext,
	TFormatVersion extends FormatVersion,
	TBuildOptions extends ICodecOptions = ICodecOptions,
	TDecodeContext = TEncodeContext,
> {
	/**
	 * String identifier stored in data encoded with this experimental format.
	 */
	readonly formatVersion: TFormatVersion & string;
	/**
	 * Experimental formats are excluded from automatic compatibility-based write selection.
	 */
	readonly minVersionForCollab: undefined;
	/**
	 * The codec and schema, or a factory which builds them from codec options.
	 */
	readonly codec: CodecSource<TDecoded, TEncodeContext, TBuildOptions, TDecodeContext>;
}

/**
 * A format which is supported for decoding but must not be used for encoding.
 *
 * @typeParam TDecoded - The in-memory data type produced by decoding.
 * @typeParam TFormatVersion - The format identifier.
 * @typeParam TBuildOptions - Options used to build the codec.
 * @typeParam TDecodeContext - Context passed to decode operations.
 * @sealed
 */
export interface CodecVersionReadonly<
	TDecoded,
	TFormatVersion extends FormatVersion,
	TBuildOptions extends ICodecOptions = ICodecOptions,
	TDecodeContext = void,
> {
	/**
	 * Identifier used to dispatch persisted data to this decoder.
	 */
	readonly formatVersion: TFormatVersion;
	/**
	 * Read-only formats are excluded from write selection.
	 */
	readonly minVersionForCollab: undefined;
	/**
	 * The decoder and schema, or a factory which builds them from codec options.
	 */
	readonly codec: ReadonlyCodecSource<TDecoded, TBuildOptions, TDecodeContext>;
}

/**
 * A format which can no longer be encoded or decoded.
 *
 * @typeParam TFormatVersion - The discontinued format identifier.
 * @sealed
 */
export interface CodecVersionDiscontinued<TFormatVersion extends FormatVersion> {
	/**
	 * Identifier of the format whose encoding and decoding are no longer supported.
	 */
	readonly formatVersion: TFormatVersion;
	/**
	 * Discontinued formats are excluded from write selection.
	 */
	readonly minVersionForCollab: undefined;
	/**
	 * First Fluid Framework client version which no longer supports this format.
	 */
	readonly discontinuedSince: SemanticVersion;
	/**
	 * The builder supplies throwing codec methods; no codec may be provided here.
	 */
	readonly codec?: never;
}

/**
 * A codec alongside its format version and schema.
 *
 * @remarks
 * Use the variant matching the format's behavior:
 *
 * - {@link CodecVersionStable} for stable formats selected by client compatibility.
 * - {@link CodecVersionExperimental} for string-identified experimental formats.
 * - {@link CodecVersionReadonly} for historical formats which are decoded but never encoded.
 * - {@link CodecVersionDiscontinued} for formats which can no longer be encoded or decoded.
 *
 * @typeParam TDecoded - The in-memory data type encoded or decoded by codec-bearing variants.
 * @typeParam TEncodeContext - Context passed to encode operations.
 * @typeParam TFormatVersion - The union of registered format identifiers.
 * @typeParam TBuildOptions - Options used to build codec-bearing variants.
 * @typeParam TDecodeContext - Context passed to decode operations.
 */
export type CodecVersion<
	TDecoded,
	TEncodeContext,
	TFormatVersion extends FormatVersion,
	TBuildOptions extends ICodecOptions = ICodecOptions,
	TDecodeContext = TEncodeContext,
> =
	| CodecVersionStable<TDecoded, TEncodeContext, TFormatVersion, TBuildOptions, TDecodeContext>
	| CodecVersionExperimental<
			TDecoded,
			TEncodeContext,
			TFormatVersion,
			TBuildOptions,
			TDecodeContext
	  >
	| CodecVersionReadonly<TDecoded, TFormatVersion, TBuildOptions, TDecodeContext>
	| CodecVersionDiscontinued<TFormatVersion>;

/**
 * A schema-validating codec with its write eligibility.
 */
type EvaluatedCodecAndSchema<TDecoded, TEncodeContext, TDecodeContext> = CodecAndSchema<
	TDecoded,
	TEncodeContext,
	TDecodeContext
> & {
	/**
	 * Whether the original declaration supplied an encoder, rather than a throwing replacement.
	 */
	readonly canEncode: boolean;
};

/**
 * {@link CodecVersion} after normalization into a consistent type.
 * @remarks
 * Produced by {@link normalizeCodecVersion}.
 * Includes schema validation.
 */
export interface NormalizedCodecVersion<
	TDecoded,
	TEncodeContext,
	TFormatVersion extends FormatVersion,
	TBuildOptions extends ICodecOptions,
	TDecodeContext = TEncodeContext,
> {
	/**
	 * Compatibility minimum for stable formats; undefined for other lifecycle variants.
	 */
	readonly minVersionForCollab: OldestSupportedClientVersion | undefined;
	/**
	 * Identifier used to dispatch encoded data to this format.
	 */
	readonly formatVersion: TFormatVersion;
	/**
	 * First client version without support, when this format is discontinued.
	 */
	readonly discontinuedSince?: SemanticVersion;
	/**
	 * Builds a schema-validating codec, including throwing methods for unsupported operations.
	 */
	readonly codec: (
		options: TBuildOptions,
	) => EvaluatedCodecAndSchema<TDecoded, TEncodeContext, TDecodeContext>;
}

/**
 * {@link NormalizedCodecVersion} after applying the build options.
 * @remarks
 * Produced by {@link VersionDispatchingCodecBuilder.applyOptions}.
 */
interface EvaluatedCodecVersion<
	TDecoded,
	TEncodeContext,
	TFormatVersion extends FormatVersion,
	TDecodeContext = TEncodeContext,
> {
	/**
	 * Compatibility minimum for stable formats; undefined for other lifecycle variants.
	 */
	readonly minVersionForCollab: OldestSupportedClientVersion | undefined;
	/**
	 * Identifier used to dispatch encoded data to this format.
	 */
	readonly formatVersion: TFormatVersion;
	/**
	 * First client version without support, when this format is discontinued.
	 */
	readonly discontinuedSince?: SemanticVersion;
	/**
	 * Whether this format supports encoding.
	 */
	readonly canEncode: boolean;
	/**
	 * The codec configured with the supplied build options.
	 * It validates encoded data against the format's schema.
	 */
	readonly codec: CodecAndSchema<TDecoded, TEncodeContext, TDecodeContext>;
}

/**
 * Returns why encoding is unsupported, or undefined for writable formats.
 */
function getUnwritableFormatKind(codecVersion: {
	readonly discontinuedSince?: SemanticVersion;
	readonly canEncode: boolean;
}): "readonly" | "discontinued" | undefined {
	if (codecVersion.discontinuedSince !== undefined) {
		return "discontinued";
	}
	return codecVersion.canEncode ? undefined : "readonly";
}

/**
 * Normalize the codec to a single format.
 * @remarks
 * Adds schema validation and throwing encoders for formats which cannot be written.
 */
function normalizeCodecVersion<
	TDecoded,
	TEncodeContext,
	TFormatVersion extends FormatVersion,
	TBuildOptions extends ICodecOptions,
	TDecodeContext = TEncodeContext,
>(
	codecVersion: CodecVersion<
		TDecoded,
		TEncodeContext,
		TFormatVersion,
		TBuildOptions,
		TDecodeContext
	>,
): NormalizedCodecVersion<
	TDecoded,
	TEncodeContext,
	TFormatVersion,
	TBuildOptions,
	TDecodeContext
> {
	if ("discontinuedSince" in codecVersion) {
		const { discontinuedSince, formatVersion } = codecVersion;
		return {
			minVersionForCollab: undefined,
			formatVersion,
			discontinuedSince,
			codec: () => ({
				canEncode: false,
				schema: JsonCompatibleReadOnlySchema,
				encode: () => {
					throw new UsageError(
						`Cannot encode data to format ${formatVersion}. The codec was discontinued in Fluid Framework client version ${discontinuedSince}.`,
					);
				},
				decode: () => {
					throw new UsageError(
						`Cannot decode data in format ${formatVersion}. The codec was discontinued in Fluid Framework client version ${discontinuedSince}.`,
					);
				},
			}),
		};
	}

	const codecSource = codecVersion.codec;
	const codec = (
		options: TBuildOptions,
	): EvaluatedCodecAndSchema<TDecoded, TEncodeContext, TDecodeContext> => {
		const built = typeof codecSource === "function" ? codecSource(options) : codecSource;
		const canEncode = built.encode !== undefined;
		const codecWithEncoder: CodecAndSchema<TDecoded, TEncodeContext, TDecodeContext> =
			built.encode === undefined
				? {
						...built,
						encode: () => {
							throw new UsageError(
								`Cannot encode data to read-only format ${JSON.stringify(codecVersion.formatVersion)}.`,
							);
						},
					}
				: built;
		return {
			...makeVersionedValidatedCodec(
				options,
				new Set([codecVersion.formatVersion]),
				built.schema,
				codecWithEncoder,
			),
			canEncode,
		};
	};
	return {
		minVersionForCollab: codecVersion.minVersionForCollab,
		formatVersion: codecVersion.formatVersion,
		codec,
	};
}

/**
 * A codec that reads registered formats and writes a single selected format.
 * @remarks
 * Produced by {@link VersionDispatchingCodecBuilder.build}.
 *
 * @typeParam TDecoded - The in memory (not encoded) format.
 * @typeParam TEncodeContext - Context type passed to encode operations.
 * @typeParam TFormatVersion - The type of format version identifiers used by this codec.
 * @typeParam TDecodeContext - Context type passed to decode operations. Defaults to `TEncodeContext`.
 */
export interface VersionDispatchingCodec<
	TDecoded,
	TEncodeContext,
	TFormatVersion extends FormatVersion,
	TDecodeContext = TEncodeContext,
> extends IJsonCodec<
		TDecoded,
		JsonCompatibleReadOnly,
		JsonCompatibleReadOnly,
		TEncodeContext,
		TDecodeContext
	> {
	/**
	 * The format version used for encoding, selected when this codec is built.
	 * @remarks
	 * Selected by {@link VersionDispatchingCodecBuilder.build} based on the provided options.
	 * Every encoded value uses this format.
	 */
	readonly writeVersion: TFormatVersion;
}

/**
 * Options which customize how a {@link VersionDispatchingCodecBuilder} selects a write format.
 *
 * @typeParam TBuildOptions - Options used to build the codec.
 * @typeParam TFormatVersion - The format identifiers which are eligible for encoding.
 */
export interface VersionDispatchingCodecBuilderOptions<
	TBuildOptions extends ICodecOptions,
	TFormatVersion extends FormatVersion,
> {
	/**
	 * Selects a write format once when the codec is built.
	 *
	 * @remarks
	 * This callback may select an experimental format declared as a
	 * {@link CodecVersionExperimental}.
	 * The codec author is responsible for ensuring that every client which can access data written
	 * in that format supports it.
	 * If the write options explicitly override this codec's format, the selected format must match
	 * that override.
	 * The selected format is validated during build and used for every subsequent encode call.
	 * Stable formats must respect the requested minimum client version.
	 *
	 * @param options - The options used to build the codec.
	 * @param defaultVersion - The format selected from the codec write options.
	 */
	readonly selectWriteFormatVersion?: (
		options: TBuildOptions & CodecWriteOptions,
		defaultVersion: TFormatVersion,
	) => TFormatVersion;
}

/**
 * Creates a {@link VersionDispatchingCodec} using a {@link CodecVersion} to select the {@link VersionDispatchingCodec.writeVersion}.
 * @privateRemarks
 * This is a two stage builder so the first stage (the static build) can encapsulate all codec specific details and
 * the second (the instance build) can bring in configuration.
 */
export class VersionDispatchingCodecBuilder<
	TBuildOptions extends ICodecOptions = ICodecOptions,
	TDecoded = unknown,
	TEncodeContext = unknown,
	TFormatVersion extends FormatVersion = FormatVersion,
	TName extends CodecName = string,
	TDecodeContext = TEncodeContext,
> {
	/**
	 * Registered format declarations normalized into codec factories.
	 */
	public readonly registry: readonly NormalizedCodecVersion<
		TDecoded,
		TEncodeContext,
		TFormatVersion,
		TBuildOptions,
		TDecodeContext
	>[];

	/**
	 * Use {@link VersionDispatchingCodecBuilder.build} to create an instance of this class.
	 * @remarks
	 * Inputs to this are assumed to be constants in the code controlled by the developers of this package,
	 * and constructed at least once during tests.
	 * Because of this, the validation of these inputs done with debugAssert should be sufficient,
	 * and using debugAssert avoids bloating the bundle size for production users.
	 */
	private constructor(
		/**
		 * See {@link CodecName}.
		 */
		public readonly name: TName,
		/**
		 * The registry of codecs which this builder can use to encode and decode data.
		 */
		inputRegistry: readonly CodecVersion<
			TDecoded,
			TEncodeContext,
			TFormatVersion,
			TBuildOptions,
			TDecodeContext
		>[],
		private readonly builderOptions: VersionDispatchingCodecBuilderOptions<
			TBuildOptions,
			TFormatVersion
		>,
	) {
		type Normalized = NormalizedCodecVersion<
			TDecoded,
			TEncodeContext,
			TFormatVersion,
			TBuildOptions,
			TDecodeContext
		>;
		const normalizedRegistry: Normalized[] = [];
		const formats: Set<FormatVersion> = new Set();
		const versions: Set<OldestSupportedClientVersion> = new Set();

		for (const codec of inputRegistry) {
			debugAssert(
				() =>
					!formats.has(codec.formatVersion) ||
					`duplicate codec format ${name} ${codec.formatVersion}`,
			);
			formats.add(codec.formatVersion);
			const normalizedCodec = normalizeCodecVersion(codec);
			normalizedRegistry.push(normalizedCodec);
			if (normalizedCodec.minVersionForCollab !== undefined) {
				const minVersionForCollab = normalizedCodec.minVersionForCollab;
				debugAssert(
					() =>
						!versions.has(minVersionForCollab) ||
						`Codec ${name} has multiple entries for version ${JSON.stringify(minVersionForCollab)}`,
				);
				versions.add(minVersionForCollab);
			}
		}

		debugAssert(
			() =>
				versions.has(lowestMinVersionForCollab) ||
				`Codec ${name} is missing entry for lowestMinVersionForCollab`,
		);

		this.registry = normalizedRegistry;
	}

	/**
	 * Applies `options` to the codec registry to produce a list of evaluated codecs.
	 * @remarks
	 * This is used by build, which is what production code should use.
	 * This is only exposed for testing purposes.
	 */
	public applyOptions(
		options: TBuildOptions,
	): EvaluatedCodecVersion<TDecoded, TEncodeContext, TFormatVersion, TDecodeContext>[] {
		return this.registry.map((codec) => {
			const evaluated = codec.codec(options);
			return {
				minVersionForCollab: codec.minVersionForCollab,
				formatVersion: codec.formatVersion,
				discontinuedSince: codec.discontinuedSince,
				canEncode: evaluated.canEncode,
				codec: evaluated,
			};
		});
	}

	/**
	 * Builds a complete {@link VersionDispatchingCodec} that can decode all registered versions
	 * and encode a version selected by the provided options.
	 */
	public build(
		options: TBuildOptions & CodecWriteOptions,
	): VersionDispatchingCodec<TDecoded, TEncodeContext, TFormatVersion, TDecodeContext> {
		const [applied, decoder] = this.buildDecoderInternal(options);
		const selectWriteFormatVersion = this.builderOptions.selectWriteFormatVersion;
		const writeVersion = getWriteVersion(
			this.name,
			options,
			applied,
			selectWriteFormatVersion === undefined
				? undefined
				: (defaultVersion) => selectWriteFormatVersion(options, defaultVersion),
		);
		return {
			...decoder,
			encode: writeVersion.codec.encode.bind(writeVersion.codec),
			writeVersion: writeVersion.formatVersion,
		};
	}

	private buildDecoderInternal(
		options: TBuildOptions,
	): [
		EvaluatedCodecVersion<TDecoded, TEncodeContext, TFormatVersion, TDecodeContext>[],
		Pick<
			IJsonCodec<
				TDecoded,
				JsonCompatibleReadOnly,
				JsonCompatibleReadOnly,
				TEncodeContext,
				TDecodeContext
			>,
			"decode"
		>,
	] {
		const applied = this.applyOptions(options);
		const fromFormatVersion = new Map<
			FormatVersion,
			EvaluatedCodecVersion<TDecoded, TEncodeContext, TFormatVersion, TDecodeContext>
		>(applied.map((codec) => [codec.formatVersion, codec]));
		return [
			applied,
			{
				decode: (data: JsonCompatibleReadOnly, context: TDecodeContext, onError): TDecoded => {
					const versioned = data as Partial<Versioned>;
					const codec = fromFormatVersion.get(versioned.version);
					if (codec === undefined) {
						throw new UsageError(
							`Unsupported version ${versioned.version} encountered while decoding ${this.name} data. Supported versions for this data are: ${versionList(applied)}.
The client which encoded this data likely specified an "minVersionForCollab" value which corresponds to a version newer than the version of this client ("${pkgVersion}").`,
						);
					}
					return codec.codec.decode(data, context, onError);
				},
			},
		];
	}

	/**
	 * Builds a decoder-only codec that can decode any supported format without encoding capability.
	 *
	 * @remarks
	 * The returned codec contains only the `decode` method and can be used when only decoding is needed.
	 * This is useful for scenarios where reading/decoding versioned data is sufficient.
	 *
	 * @param options - Build options (typically containing the `jsonValidator`)
	 * @returns An object with a `decode` method that can handle any supported format version
	 */
	public buildDecoder(
		options: TBuildOptions,
	): Pick<
		VersionDispatchingCodec<TDecoded, TEncodeContext, TFormatVersion, TDecodeContext>,
		"decode"
	> {
		return this.buildDecoderInternal(options)[1];
	}

	public getCodecTree(clientVersion: OldestSupportedClientVersion): CodecTree<TFormatVersion> {
		// TODO: add support for children codecs.
		const selected = getWriteVersionNoOverrides(this.registry, clientVersion);
		return {
			name: this.name,
			version: selected.formatVersion,
		};
	}

	/**
	 * Creates a new VersionDispatchingCodecBuilder from the provided codec registry.
	 *
	 * @remarks
	 * This static method infers the types of the builder from the provided registry,
	 * making it easier to create builders without needing to explicitly specify all type parameters.
	 * This gets better type inference than the constructor.
	 *
	 * @example
	 * ```typescript
	 * const builder = VersionDispatchingCodecBuilder.build('myCodec', [
	 *   { minVersionForCollab: lowestMinVersionForCollab, formatVersion: 1, codec: { encode, decode, schema } },
	 *   { minVersionForCollab: '2.100.0', formatVersion: 2, codec: { encode, decode, schema } },
	 * ]);
	 * ```
	 */
	// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
	public static build<
		Name extends CodecName,
		const Entry extends CodecVersion<unknown, unknown, FormatVersion, never, unknown>,
	>(
		name: Name,
		inputRegistry: readonly Entry[],
		options: VersionDispatchingCodecBuilderOptions<
			UnionToIntersection<
				Entry extends { readonly codec: infer InputSource }
					? InputSource extends (options: infer B extends ICodecOptions) => unknown
						? B
						: never
					: never
			> &
				ICodecOptions,
			Entry extends {
				readonly codec:
					| CodecAndSchema<unknown, unknown, unknown>
					| ((options: never) => CodecAndSchema<unknown, unknown, unknown>);
			}
				? Entry["formatVersion"]
				: never
		> = {},
	) {
		// Registries can mix direct codecs, factories, read-only formats, and discontinued formats.
		// Infer value and context types from the methods that exist, so entries without those methods
		// do not erase useful types. Extract factory options separately so every factory's required
		// options remain required, including in registries annotated with the CodecVersion union.

		/** Excludes discontinued declarations, which have no codec source. */
		type Source = Entry extends { readonly codec: infer S } ? S : never;
		/** Resolves factories while preserving direct codecs in source unions. */
		type CodecFromSource<T> = T extends (options: never) => infer C ? C : T;
		type Codec = CodecFromSource<Source>;
		/** Extracts the value produced by a decoder. */
		type DecodedFromCodec<T> = T extends { decode(...args: never[]): infer D } ? D : never;
		/** Extracts encoding context only from codecs which can encode. */
		type EncodeContextFromCodec<T> = T extends {
			encode(data: never, context: infer C): unknown;
		}
			? C
			: never;
		/** Collects factory requirements without direct codecs contributing options. */
		type BuildOptionsFromSource<T> = T extends (
			options: infer B extends ICodecOptions,
		) => unknown
			? B
			: never;
		/** Extracts decoding context independently of encoding context. */
		type DecodeContextFromCodec<T> = T extends {
			decode(data: never, context: infer C): unknown;
		}
			? C
			: never;
		type TDecoded2 = DecodedFromCodec<Codec>;
		type TEncodeContext2 = EncodeContextFromCodec<Codec>;
		type TFormatVersion2 = Entry["formatVersion"];
		type TBuildOptions2 = BuildOptionsFromSource<Source>;
		type TDecodeContext2 = DecodeContextFromCodec<Codec>;

		// All registered factories are built, so all their option requirements must be met.
		type ResolvedBuildOptions = [TBuildOptions2] extends [never]
			? ICodecOptions
			: UnionToIntersection<TBuildOptions2> & ICodecOptions;
		type ResolvedEncodeContext = unknown extends TEncodeContext2 ? void : TEncodeContext2;
		type ResolvedDecodeContext = unknown extends TDecodeContext2
			? ResolvedEncodeContext
			: TDecodeContext2;

		type CodecFinal = CodecVersion<
			TDecoded2,
			// If it does not matter what context is provided, undefined is fine, so allow it to be omitted.
			ResolvedEncodeContext,
			TFormatVersion2,
			ResolvedBuildOptions,
			ResolvedDecodeContext
		>;

		const input = inputRegistry as readonly unknown[] as readonly CodecFinal[];
		const builderOptions = options as unknown as VersionDispatchingCodecBuilderOptions<
			ResolvedBuildOptions,
			TFormatVersion2
		>;

		const builder = new VersionDispatchingCodecBuilder<
			ResolvedBuildOptions,
			TDecoded2,
			ResolvedEncodeContext,
			TFormatVersion2,
			Name,
			ResolvedDecodeContext
		>(name, input, builderOptions);
		return builder;
	}
}

/**
 * Selects which format should be used when writing data.
 * @remarks
 * The default is the override specified in the options, or the newest stable format compatible with the provided minVersionForCollab.
 * If a selector is provided, validates and uses its choice instead; that choice must match any explicit override.
 */
function getWriteVersion<
	T extends EvaluatedCodecVersion<unknown, unknown, FormatVersion, unknown>,
>(
	name: CodecName,
	options: CodecWriteOptions,
	versions: readonly T[],
	selectWriteFormatVersion?: (defaultVersion: T["formatVersion"]) => T["formatVersion"],
): T {
	let defaultVersion: T;
	if (options.writeVersionOverrides?.has(name) === true) {
		const overriddenFormatVersion = options.writeVersionOverrides.get(name);
		const override = versions.find((codec) => codec.formatVersion === overriddenFormatVersion);
		if (override === undefined) {
			throw new UsageError(
				`Codec "${name}" does not support requested format version ${JSON.stringify(overriddenFormatVersion)}. Supported writable versions are: ${writableVersionList(versions)}.`,
			);
		}
		const unwritableOverrideKind = getUnwritableFormatKind(override);
		if (unwritableOverrideKind !== undefined) {
			throw new UsageError(
				`Codec "${name}" cannot use requested format version ${JSON.stringify(overriddenFormatVersion)} for encoding because it is ${unwritableOverrideKind}.`,
			);
		}
		if (options.allowPossiblyIncompatibleWriteVersionOverrides !== true) {
			const selectedMinVersionForCollab = override.minVersionForCollab;
			if (selectedMinVersionForCollab === undefined) {
				throw new UsageError(
					`Codec "${name}" does not support requested format version ${JSON.stringify(overriddenFormatVersion)} because it is experimental. Use "allowPossiblyIncompatibleWriteVersionOverrides" to suppress this error if appropriate.`,
				);
			}
			if (gt(selectedMinVersionForCollab, options.minVersionForCollab)) {
				throw new UsageError(
					`Codec "${name}" does not support requested format version ${JSON.stringify(overriddenFormatVersion)} because it is only compatible back to client version ${selectedMinVersionForCollab} and the requested oldest compatible client was ${options.minVersionForCollab}. Use "allowPossiblyIncompatibleWriteVersionOverrides" to suppress this error if appropriate.`,
				);
			}
		}

		defaultVersion = override;
	} else {
		defaultVersion = getWriteVersionNoOverrides(versions, options.minVersionForCollab);
	}

	if (selectWriteFormatVersion === undefined) {
		return defaultVersion;
	}
	const selectedFormatVersion = selectWriteFormatVersion(defaultVersion.formatVersion);
	const selected = versions.find((codec) => codec.formatVersion === selectedFormatVersion);
	if (selected === undefined) {
		throw new UsageError(
			`Codec "${name}" selected unsupported format version ${JSON.stringify(selectedFormatVersion)}. Supported versions are: ${versionList(versions)}.`,
		);
	}
	const unwritableFormatKind = getUnwritableFormatKind(selected);
	if (unwritableFormatKind !== undefined) {
		throw new UsageError(
			`Codec "${name}" cannot encode data using ${unwritableFormatKind} format version ${JSON.stringify(selectedFormatVersion)}.`,
		);
	}
	if (selected !== defaultVersion) {
		if (options.writeVersionOverrides?.has(name) === true) {
			throw new UsageError(
				`Codec "${name}" selected format version ${JSON.stringify(selectedFormatVersion)}, which conflicts with explicitly selected format version ${JSON.stringify(defaultVersion.formatVersion)}.`,
			);
		}
		if (
			selected.minVersionForCollab !== undefined &&
			gt(selected.minVersionForCollab, options.minVersionForCollab)
		) {
			throw new UsageError(
				`Codec "${name}" selected format version ${JSON.stringify(selectedFormatVersion)}, but that format is only compatible back to client version ${selected.minVersionForCollab} and the requested oldest compatible client was ${options.minVersionForCollab}.`,
			);
		}
	}
	return selected;
}

/**
 * Selects which format should be used when writing data, without consider overrides.
 */
function getWriteVersionNoOverrides<
	T extends {
		readonly minVersionForCollab: OldestSupportedClientVersion | undefined;
	},
>(versions: readonly T[], minVersionForCollab: OldestSupportedClientVersion): T {
	const stableVersions: [MinimumMinorSemanticVersion | OldestSupportedClientVersion, T][] = [];
	for (const version of versions) {
		if (version.minVersionForCollab !== undefined) {
			stableVersions.push([version.minVersionForCollab, version]);
		}
	}

	const result: T = getConfigForMinVersionForCollabIterable(
		minVersionForCollab,
		stableVersions,
	);
	return result;
}

/**
 * Formats a list of versions for use in UsageErrors.
 */
function versionList(
	versions: readonly {
		readonly formatVersion: FormatVersion;
	}[],
): string {
	return JSON.stringify(Array.from(versions, (codec) => codec.formatVersion));
}

/**
 * Formats only writable identifiers for write-selection error messages.
 */
function writableVersionList(
	versions: readonly {
		readonly formatVersion: FormatVersion;
		readonly canEncode: boolean;
	}[],
): string {
	return versionList(versions.filter((version) => version.canEncode));
}
