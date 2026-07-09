/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, debugAssert } from "@fluidframework/core-utils/internal";
import type { MinDocumentRuntimeVersion } from "@fluidframework/runtime-definitions/internal";
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
} from "../../util/index.js";
import {
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
		decode: (data: TValidate, context: TDecodeContext): TDecoded => {
			const versioned = data as Versioned; // Validated by withSchemaValidation
			if (!supportedVersions.has(versioned.version)) {
				throw new UsageError(
					`Unsupported version ${versioned.version} encountered while decoding data. Supported versions for this data are: ${[...supportedVersions].join(", ")}.
The client which encoded this data likely specified a "minDocumentRuntimeVersion" value which corresponds to a version newer than the version of this client ("${pkgVersion}").`,
				);
			}
			const decoded = inner.decode(data, context);
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
 * Creates a codec version which always throws a UsageError when encoding or decoding, indicating that the format version is discontinued.
 */
export function makeDiscontinuedCodecAndSchema<
	TDecoded,
	TFormatVersion extends FormatVersion = FormatVersion,
>(
	discontinuedVersion: TFormatVersion,
	discontinuedSince: SemanticVersion,
): CodecVersion<TDecoded, unknown, TFormatVersion, ICodecOptions, unknown> {
	return {
		minDocumentRuntimeVersion: undefined,
		formatVersion: discontinuedVersion,
		codec: {
			schema: JsonCompatibleReadOnlySchema,
			encode: (_data: TDecoded) => {
				throw new UsageError(
					`Cannot encode data to format ${discontinuedVersion}. The codec was discontinued in Fluid Framework client version ${discontinuedSince}.`,
				);
			},
			decode: (data: unknown) => {
				throw new UsageError(
					`Cannot decode data in format ${discontinuedVersion}. The codec was discontinued in Fluid Framework client version ${discontinuedSince}.`,
				);
			},
		},
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
 * A codec alongside its format version and schema.
 */
export interface CodecVersionBase<
	T = unknown,
	TFormatVersion extends FormatVersion = FormatVersion,
> {
	/**
	 * When `undefined` the codec will never be selected as a write version except via override.
	 * @remarks
	 * This format will be used for decode if data in it needs to be decoded, regardless of `minDocumentRuntimeVersion`.
	 * `undefined` should be used for unstable codec versions (with string FormatVersions),
	 * as well as previously stabilized formats that are discontinued (meaning we always prefer to use some other format for encoding).
	 */
	readonly minDocumentRuntimeVersion: MinDocumentRuntimeVersion | undefined;
	readonly formatVersion: TFormatVersion;
	readonly codec: T;
}

/**
 * A particular version of a codec and when to use it.
 * @privateRemarks
 * This allows lazy building of the codec with options.
 * This option can likely be removed as the codec handling is made simpler and more consistent.
 * Removing support for this laziness would be nice to help prevent unexpected coupling and alteration to codec behavior,
 * helping ensure that tests and production code behave the same.
 */
export interface CodecVersion<
	TDecoded,
	TEncodeContext,
	TFormatVersion extends FormatVersion,
	TBuildOptions extends ICodecOptions = ICodecOptions,
	TDecodeContext = TEncodeContext,
> extends CodecVersionBase<
		| CodecAndSchema<TDecoded, TEncodeContext, TDecodeContext>
		| ((options: TBuildOptions) => CodecAndSchema<TDecoded, TEncodeContext, TDecodeContext>),
		TFormatVersion
	> {}

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
> extends CodecVersionBase<
		(options: TBuildOptions) => CodecAndSchema<TDecoded, TEncodeContext, TDecodeContext>,
		TFormatVersion
	> {}

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
> extends CodecVersionBase<
		CodecAndSchema<TDecoded, TEncodeContext, TDecodeContext>,
		TFormatVersion
	> {}

/**
 * Normalize the codec to a single format.
 * @remarks
 * Bakes in schema validation, so output no longer exposes the schema.
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
	const codecBuilder: (
		options: TBuildOptions,
	) => CodecAndSchema<TDecoded, TEncodeContext, TDecodeContext> =
		typeof codecVersion.codec === "function"
			? codecVersion.codec
			: () => codecVersion.codec as CodecAndSchema<TDecoded, TEncodeContext, TDecodeContext>;
	const codec = (
		options: TBuildOptions,
	): CodecAndSchema<TDecoded, TEncodeContext, TDecodeContext> => {
		const built = codecBuilder(options);
		return makeVersionedValidatedCodec(
			options,
			new Set([codecVersion.formatVersion]),
			built.schema,
			built,
		);
	};

	return {
		minDocumentRuntimeVersion: codecVersion.minDocumentRuntimeVersion,
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
	 */
	readonly writeVersion: TFormatVersion;
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
		const versions: Set<string | undefined> = new Set();

		for (const codec of inputRegistry) {
			debugAssert(
				() =>
					!formats.has(codec.formatVersion) ||
					`duplicate codec format ${name} ${codec.formatVersion}`,
			);
			debugAssert(
				() =>
					codec.minDocumentRuntimeVersion === undefined ||
					typeof codec.formatVersion !== "string" ||
					`unstable format ${JSON.stringify(codec.formatVersion)} (string formats) must not have a minDocumentRuntimeVersion in ${name}`,
			);
			formats.add(codec.formatVersion);
			const normalizedCodec = normalizeCodecVersion(codec);
			normalizedRegistry.push(normalizedCodec);
			if (codec.minDocumentRuntimeVersion !== undefined) {
				debugAssert(
					() =>
						!versions.has(codec.minDocumentRuntimeVersion) ||
						`Codec ${name} has multiple entries for version ${JSON.stringify(codec.minDocumentRuntimeVersion)}`,
				);
				versions.add(codec.minDocumentRuntimeVersion);
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
		return this.registry.map((codec) => ({
			minDocumentRuntimeVersion: codec.minDocumentRuntimeVersion,
			formatVersion: codec.formatVersion,
			codec: codec.codec(options),
		}));
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
		return {
			...decoder,
			encode: (data: TDecoded, context: TEncodeContext): JsonCompatibleReadOnly => {
				return writeVersion.codec.encode(data, context);
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
				decode: (data: JsonCompatibleReadOnly, context: TDecodeContext): TDecoded => {
					const versioned = data as Partial<Versioned>;
					const codec = fromFormatVersion.get(versioned.version);
					if (codec === undefined) {
						throw new UsageError(
							`Unsupported version ${versioned.version} encountered while decoding ${this.name} data. Supported versions for this data are: ${versionList(applied)}.
The client which encoded this data likely specified a "minDocumentRuntimeVersion" value which corresponds to a version newer than the version of this client ("${pkgVersion}").`,
						);
					}
					return codec.codec.decode(data, context);
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

	public getCodecTree(clientVersion: MinDocumentRuntimeVersion): CodecTree<TFormatVersion> {
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
	 *   { minDocumentRuntimeVersion: lowestMinVersionForCollab, formatVersion: 1, codec: { encode, decode, schema } },
	 *   { minDocumentRuntimeVersion: '2.100.0', formatVersion: 2, codec: { encode, decode, schema } },
	 * ]);
	 * ```
	 */
	// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
	public static build<
		Name extends CodecName,
		Entry extends CodecVersion<unknown, unknown, FormatVersion, never, unknown>,
	>(name: Name, inputRegistry: readonly Entry[]) {
		type TDecoded2 =
			Entry extends CodecVersion<infer D, unknown, FormatVersion, never, unknown> ? D : never;
		type TEncodeContext2 =
			Entry extends CodecVersion<unknown, infer C, FormatVersion, never, unknown> ? C : never;
		type TFormatVersion2 =
			Entry extends CodecVersion<unknown, unknown, infer F, never, unknown> ? F : never;
		type TBuildOptions2 =
			Entry extends CodecVersion<unknown, unknown, FormatVersion, infer B, unknown>
				? B
				: never;
		type TDecodeContext2 =
			Entry extends CodecVersion<unknown, unknown, FormatVersion, never, infer D> ? D : never;

		type ResolvedEncodeContext = unknown extends TEncodeContext2 ? void : TEncodeContext2;
		type ResolvedDecodeContext = unknown extends TDecodeContext2
			? ResolvedEncodeContext
			: TDecodeContext2;

		type CodecFinal = CodecVersion<
			TDecoded2,
			// If it does not matter what context is provided, undefined is fine, so allow it to be omitted.
			ResolvedEncodeContext,
			TFormatVersion2,
			TBuildOptions2,
			ResolvedDecodeContext
		>;

		const input = inputRegistry as readonly unknown[] as readonly CodecFinal[];

		const builder = new VersionDispatchingCodecBuilder<
			TBuildOptions2,
			TDecoded2,
			ResolvedEncodeContext,
			TFormatVersion2,
			Name,
			ResolvedDecodeContext
		>(name, input);
		return builder;
	}
}

/**
 * Selects which format should be used when writing data.
 * @remarks
 * This either uses the override specified in the options, or selects the newest format compatible with the provided minDocumentRuntimeVersion.
 */
function getWriteVersion<T extends CodecVersionBase>(
	name: CodecName,
	options: CodecWriteOptions,
	versions: readonly T[],
): T {
	const minDocumentRuntimeVersion = getMinDocumentRuntimeVersionFromCodecWriteOptions(options);
	if (options.writeVersionOverrides?.has(name) === true) {
		const selectedFormatVersion = options.writeVersionOverrides.get(name);
		const selected = versions.find((codec) => codec.formatVersion === selectedFormatVersion);
		if (selected === undefined) {
			throw new UsageError(
				`Codec "${name}" does not support requested format version ${JSON.stringify(selectedFormatVersion)}. Supported versions are: ${versionList(versions)}.`,
			);
		} else if (options.allowPossiblyIncompatibleWriteVersionOverrides !== true) {
			const selectedMinDocumentRuntimeVersion = selected.minDocumentRuntimeVersion;
			if (selectedMinDocumentRuntimeVersion === undefined) {
				throw new UsageError(
					`Codec "${name}" does not support requested format version ${JSON.stringify(selectedFormatVersion)} because it has minDocumentRuntimeVersion undefined. Use "allowPossiblyIncompatibleWriteVersionOverrides" to suppress this error if appropriate.`,
				);
			} else if (gt(selectedMinDocumentRuntimeVersion, minDocumentRuntimeVersion)) {
				throw new UsageError(
					`Codec "${name}" does not support requested format version ${JSON.stringify(selectedFormatVersion)} because it is only compatible back to client version ${selectedMinDocumentRuntimeVersion} and the requested oldest compatible client was ${minDocumentRuntimeVersion}. Use "allowPossiblyIncompatibleWriteVersionOverrides" to suppress this error if appropriate.`,
				);
			}
		}

		return selected;
	}

	return getWriteVersionNoOverrides(versions, minDocumentRuntimeVersion);
}

function getMinDocumentRuntimeVersionFromCodecWriteOptions(
	options: CodecWriteOptions,
): MinDocumentRuntimeVersion {
	const { minDocumentRuntimeVersion } = options;
	// eslint-disable-next-line @typescript-eslint/no-deprecated -- Compatibility alias normalization.
	const { minVersionForCollab } = options;
	if (minDocumentRuntimeVersion !== undefined && minVersionForCollab !== undefined) {
		throw new UsageError(
			"Only specify one of minDocumentRuntimeVersion or minVersionForCollab.",
		);
	}
	if (minDocumentRuntimeVersion === undefined && minVersionForCollab === undefined) {
		throw new UsageError("minDocumentRuntimeVersion must be provided.");
	}
	const version = minDocumentRuntimeVersion ?? minVersionForCollab;
	assert(version !== undefined, "minDocumentRuntimeVersion must be provided.");
	return version;
}

/**
 * Selects which format should be used when writing data, without consider overrides.
 */
function getWriteVersionNoOverrides<T extends CodecVersionBase>(
	versions: readonly T[],
	minDocumentRuntimeVersion: MinDocumentRuntimeVersion,
): T {
	const stableVersions: [MinimumMinorSemanticVersion | MinDocumentRuntimeVersion, T][] = [];
	for (const version of versions) {
		if (version.minDocumentRuntimeVersion !== undefined) {
			stableVersions.push([version.minDocumentRuntimeVersion, version]);
		}
	}

	const result: T = getConfigForMinVersionForCollabIterable(
		minDocumentRuntimeVersion,
		stableVersions,
	);
	return result;
}

/**
 * Formats a list of versions for use in UsageErrors.
 */
function versionList(versions: readonly CodecVersionBase[]): string {
	return JSON.stringify(Array.from(versions, (codec) => codec.formatVersion));
}
