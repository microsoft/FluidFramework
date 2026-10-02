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
	readonly schema: TSchema;
	readonly encode?: never;
}

type CodecSource<
	TDecoded,
	TEncodeContext,
	TBuildOptions extends ICodecOptions,
	TDecodeContext,
> =
	| CodecAndSchema<TDecoded, TEncodeContext, TDecodeContext>
	| ((options: TBuildOptions) => CodecAndSchema<TDecoded, TEncodeContext, TDecodeContext>);

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
	readonly formatVersion: TFormatVersion & string;
	readonly minVersionForCollab: undefined;
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
	readonly formatVersion: TFormatVersion;
	readonly minVersionForCollab: undefined;
	readonly codec: ReadonlyCodecSource<TDecoded, TBuildOptions, TDecodeContext>;
}

/**
 * A format which can no longer be encoded or decoded.
 *
 * @typeParam TFormatVersion - The discontinued format identifier.
 * @sealed
 */
export interface CodecVersionDiscontinued<TFormatVersion extends FormatVersion> {
	readonly formatVersion: TFormatVersion;
	readonly minVersionForCollab: undefined;
	readonly discontinuedSince: SemanticVersion;
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
 * Extracts codec sources, excluding discontinued entries which have no codec.
 */
type CodecSourceFromCodecVersion<T> = T extends { readonly codec: infer TSource }
	? TSource
	: never;

/**
 * Resolves direct codecs and factory return types, distributing over codec-or-factory unions.
 */
type CodecFromSource<T> = T extends (options: never) => infer TCodec ? TCodec : T;

type DecodedFromCodec<T> = T extends { decode(...args: never[]): infer TDecoded }
	? TDecoded
	: never;

type EncodeContextFromCodec<T> = T extends {
	encode(data: never, context: infer TContext): unknown;
}
	? TContext
	: never;

type WritableFormatVersionFromCodecVersion<T> = T extends {
	readonly formatVersion: infer TFormatVersion;
	readonly codec: infer TSource;
}
	? CodecFromSource<TSource> extends { encode(...args: never[]): unknown }
		? TFormatVersion
		: never
	: never;

/**
 * Extracts factory options, ignoring direct codecs even in codec-or-factory unions.
 */
type BuildOptionsFromCodecSource<T> = T extends (
	options: infer TBuildOptions extends ICodecOptions,
) => unknown
	? TBuildOptions
	: never;

type DecodeContextFromCodec<T> = T extends {
	decode(data: never, context: infer TContext): unknown;
}
	? TContext
	: never;

/**
 * A schema-validating codec with its write eligibility.
 */
type EvaluatedCodecAndSchema<TDecoded, TEncodeContext, TDecodeContext> = CodecAndSchema<
	TDecoded,
	TEncodeContext,
	TDecodeContext
> & {
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
	readonly minVersionForCollab: OldestSupportedClientVersion | undefined;
	readonly formatVersion: TFormatVersion;
	readonly discontinuedSince?: SemanticVersion;
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
	readonly minVersionForCollab: OldestSupportedClientVersion | undefined;
	readonly formatVersion: TFormatVersion;
	readonly discontinuedSince?: SemanticVersion;
	readonly canEncode: boolean;
	readonly codec: CodecAndSchema<TDecoded, TEncodeContext, TDecodeContext>;
}

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
 * A codec that can read multiple format versions and write a single selected version.
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
	 * The format version which this codec writes.
	 * @remarks
	 * Selected by {@link VersionDispatchingCodecBuilder.build} based on the provided options.
	 * If the builder has a {@link VersionDispatchingCodecBuilderOptions.selectWriteFormatVersion}
	 * callback, individual values may be encoded using a different format.
	 */
	readonly writeVersion: TFormatVersion;
}

/**
 * Options which customize how a {@link VersionDispatchingCodecBuilder} selects a write format.
 *
 * @typeParam TDecoded - The in-memory data type being encoded.
 * @typeParam TFormatVersion - The format identifiers which are eligible for encoding.
 */
export interface VersionDispatchingCodecBuilderOptions<
	TDecoded,
	TFormatVersion extends FormatVersion,
> {
	/**
	 * Selects a write format for each value.
	 *
	 * @remarks
	 * This callback may select an experimental format declared as a
	 * {@link CodecVersionExperimental}.
	 * The codec author is responsible for ensuring that every client which can access data written
	 * in that format supports it.
	 * If the write options explicitly override this codec's format, the selected format must match
	 * that override.
	 *
	 * @param data - The value being encoded.
	 * @param defaultVersion - The format selected from the codec write options.
	 */
	readonly selectWriteFormatVersion?: (
		data: TDecoded,
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
			TDecoded,
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
		const writeVersion = getWriteVersion(this.name, options, applied);
		const fromOverride = options.writeVersionOverrides?.has(this.name) === true;
		const fromFormatVersion = new Map(
			applied.map((codec) => [codec.formatVersion, codec] as const),
		);
		return {
			...decoder,
			encode: (data: TDecoded, context: TEncodeContext): JsonCompatibleReadOnly => {
				const selectedFormatVersion =
					this.builderOptions.selectWriteFormatVersion === undefined
						? writeVersion.formatVersion
						: this.builderOptions.selectWriteFormatVersion(data, writeVersion.formatVersion);
				const selected = fromFormatVersion.get(selectedFormatVersion);
				if (selected === undefined) {
					throw new UsageError(
						`Codec "${this.name}" selected unsupported format version ${JSON.stringify(selectedFormatVersion)} while encoding. Supported versions are: ${versionList(applied)}.`,
					);
				}
				const unwritableFormatKind = getUnwritableFormatKind(selected);
				if (unwritableFormatKind !== undefined) {
					throw new UsageError(
						`Codec "${this.name}" cannot encode data using ${unwritableFormatKind} format version ${JSON.stringify(selectedFormatVersion)}.`,
					);
				}
				if (selectedFormatVersion !== writeVersion.formatVersion) {
					if (fromOverride) {
						throw new UsageError(
							`Codec "${this.name}" cannot encode this data using explicitly selected format version ${JSON.stringify(writeVersion.formatVersion)}. The data requires format version ${JSON.stringify(selectedFormatVersion)}.`,
						);
					}
					if (
						selected.minVersionForCollab !== undefined &&
						gt(selected.minVersionForCollab, options.minVersionForCollab)
					) {
						throw new UsageError(
							`Codec "${this.name}" selected format version ${JSON.stringify(selectedFormatVersion)} for this data, but that format is only compatible back to client version ${selected.minVersionForCollab} and the requested oldest compatible client was ${options.minVersionForCollab}.`,
						);
					}
				}
				return selected.codec.encode(data, context);
			},
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
		const TRegistry extends readonly CodecVersion<
			unknown,
			unknown,
			FormatVersion,
			never,
			unknown
		>[],
	>(
		name: Name,
		inputRegistry: TRegistry,
		options: VersionDispatchingCodecBuilderOptions<
			DecodedFromCodec<CodecFromSource<CodecSourceFromCodecVersion<TRegistry[number]>>>,
			WritableFormatVersionFromCodecVersion<TRegistry[number]>
		> = {},
	) {
		type Entry = TRegistry[number];
		type Source = CodecSourceFromCodecVersion<Entry>;
		type Codec = CodecFromSource<Source>;
		type TDecoded2 = DecodedFromCodec<Codec>;
		type TEncodeContext2 = EncodeContextFromCodec<Codec>;
		type TFormatVersion2 = Entry["formatVersion"];
		type TBuildOptions2 = BuildOptionsFromCodecSource<Source>;
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
			TDecoded2,
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
 * This either uses the override specified in the options, or selects the newest format compatible with the provided minVersionForCollab.
 */
function getWriteVersion<
	T extends EvaluatedCodecVersion<unknown, unknown, FormatVersion, unknown>,
>(name: CodecName, options: CodecWriteOptions, versions: readonly T[]): T {
	if (options.writeVersionOverrides?.has(name) === true) {
		const selectedFormatVersion = options.writeVersionOverrides.get(name);
		const selected = versions.find((codec) => codec.formatVersion === selectedFormatVersion);
		if (selected === undefined) {
			throw new UsageError(
				`Codec "${name}" does not support requested format version ${JSON.stringify(selectedFormatVersion)}. Supported writable versions are: ${writableVersionList(versions)}.`,
			);
		}
		const unwritableFormatKind = getUnwritableFormatKind(selected);
		if (unwritableFormatKind !== undefined) {
			throw new UsageError(
				`Codec "${name}" cannot use requested format version ${JSON.stringify(selectedFormatVersion)} for encoding because it is ${unwritableFormatKind}.`,
			);
		}
		if (options.allowPossiblyIncompatibleWriteVersionOverrides !== true) {
			const selectedMinVersionForCollab = selected.minVersionForCollab;
			if (selectedMinVersionForCollab === undefined) {
				throw new UsageError(
					`Codec "${name}" does not support requested format version ${JSON.stringify(selectedFormatVersion)} because it is experimental. Use "allowPossiblyIncompatibleWriteVersionOverrides" to suppress this error if appropriate.`,
				);
			}
			if (gt(selectedMinVersionForCollab, options.minVersionForCollab)) {
				throw new UsageError(
					`Codec "${name}" does not support requested format version ${JSON.stringify(selectedFormatVersion)} because it is only compatible back to client version ${selectedMinVersionForCollab} and the requested oldest compatible client was ${options.minVersionForCollab}. Use "allowPossiblyIncompatibleWriteVersionOverrides" to suppress this error if appropriate.`,
				);
			}
		}

		return selected;
	}

	return getWriteVersionNoOverrides(versions, options.minVersionForCollab);
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

function writableVersionList(
	versions: readonly {
		readonly formatVersion: FormatVersion;
		readonly canEncode: boolean;
	}[],
): string {
	return versionList(versions.filter((version) => version.canEncode));
}
