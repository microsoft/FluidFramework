/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, debugAssert } from "@fluidframework/core-utils/internal";
import type { MinimumVersionForCollab } from "@fluidframework/runtime-definitions/internal";
import {
	getConfigForMinVersionForCollabIterable,
	lowestMinVersionForCollab,
	type MinimumMinorSemanticVersion,
	type SemanticVersion,
} from "@fluidframework/runtime-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import { Type, type TSchema } from "@sinclair/typebox";
import { gt } from "semver-ts";

import { pkgVersion } from "../../packageVersion.js";
import type {
	JsonCompatibleReadOnly,
	JsonCompatibleReadOnlyObject,
} from "../../util/index.js";
import {
	type ICodecFamily,
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

function makeVersionedCodec<
	TDecoded,
	TEncoded extends Versioned = VersionedJson,
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
					`Unsupported version ${versioned.version} encountered while decoding data. Supported versions for this data are: ${[...supportedVersions].join(", ")}.
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

/**
 * TODO: users of this should migrate to {@link ClientVersionDispatchingCodecBuilder}.
 */
export function makeVersionedValidatedCodec<
	EncodedSchema extends TSchema,
	TDecoded,
	TEncoded extends Versioned = VersionedJson,
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
 *
 * TODO: {@link ClientVersionDispatchingCodecBuilder} should get support for extra decode only entries and/or unstable formats (codecs without a minVersionForCollab that will never be selected for write unless overridden).
 * Once done, users of this should migrate to ClientVersionDispatchingCodecBuilder and this function can be simplified.
 */
export function makeDiscontinuedCodecVersion<
	TDecoded,
	TEncoded extends Versioned = VersionedJson,
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
 * TODO: Users of this should migrate to {@link ClientVersionDispatchingCodecBuilder} so that the actual format version used can be encapsulated.
 */
export function makeVersionDispatchingCodec<TDecoded, TContext>(
	family: ICodecFamily<TDecoded, TContext>,
	options: ICodecOptions & { writeVersion: FormatVersion },
): IJsonCodec<TDecoded, JsonCompatibleReadOnly, JsonCompatibleReadOnly, TContext> {
	const writeCodec = family.resolve(options.writeVersion);
	const supportedVersions = new Set(family.getSupportedFormats());
	return makeVersionedCodec(supportedVersions, options, {
		encode(data, context): Versioned {
			return writeCodec.encode(data, context) as Versioned;
		},
		decode(data: Versioned, context) {
			const codec = family.resolve(data.version);
			return codec.decode(data, context);
		},
	});
}

/**
 * A friendly format for codec authors use to define their codec and schema for use in {@link CodecVersion}.
 * @remarks
 * The codec should not perform its own schema validation.
 * The schema validation gets added when normalizing to {@link NormalizedCodecVersion}.
 */
export type CodecAndSchema<TDecoded, TContext = void> = {
	readonly schema: TSchema;
} & IJsonCodec<TDecoded, VersionedJson, JsonCompatibleReadOnly, TContext>;

/**
 * A codec alongside its format version and schema.
 */
export interface CodecVersionBase<
	T = unknown,
	TFormatVersion extends FormatVersion = FormatVersion,
> {
	/**
	 * When `undefined` the codec never be selected as a write version unless via override.
	 * @remarks
	 * This format will be used for decode if data in it needs to be decoded, regardless of `minVersionForCollab`.
	 * `undefined` should be used for unstable codec versions (with string FormatVersions),
	 * as well as previously stabilized formats that are discontinued (meaning we always prefer to use some other format for encoding).
	 */
	readonly minVersionForCollab: MinimumVersionForCollab | undefined;
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
	TContext,
	TFormatVersion extends FormatVersion,
	TBuildOptions extends CodecWriteOptions,
> extends CodecVersionBase<
		| CodecAndSchema<TDecoded, TContext>
		| ((options: TBuildOptions) => CodecAndSchema<TDecoded, TContext>),
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
	TContext,
	TFormatVersion extends FormatVersion,
	TBuildOptions extends CodecWriteOptions,
> extends CodecVersionBase<
		(
			options: TBuildOptions,
		) => IJsonCodec<TDecoded, VersionedJson, JsonCompatibleReadOnly, TContext>,
		TFormatVersion
	> {}

/**
 * {@link NormalizedCodecVersion} after applying the build options.
 * @remarks
 * Produced by {@link ClientVersionDispatchingCodecBuilder.applyOptions}.
 */
interface EvaluatedCodecVersion<TDecoded, TContext, TFormatVersion extends FormatVersion>
	extends CodecVersionBase<
		IJsonCodec<TDecoded, VersionedJson, JsonCompatibleReadOnly, TContext>,
		TFormatVersion
	> {}

/**
 * Normalize the codec to a single format.
 * @remarks
 * Bakes in schema validation, so output no longer exposes the schema.
 */
function normalizeCodecVersion<
	TDecoded,
	TContext,
	TFormatVersion extends FormatVersion,
	TBuildOptions extends CodecWriteOptions,
>(
	codecVersion: CodecVersion<TDecoded, TContext, TFormatVersion, TBuildOptions>,
): NormalizedCodecVersion<TDecoded, TContext, TFormatVersion, TBuildOptions> {
	const codecBuilder: (options: TBuildOptions) => CodecAndSchema<TDecoded, TContext> =
		typeof codecVersion.codec === "function"
			? codecVersion.codec
			: () => codecVersion.codec as CodecAndSchema<TDecoded, TContext>;
	const codec = (
		options: TBuildOptions,
	): IJsonCodec<TDecoded, VersionedJson, JsonCompatibleReadOnly, TContext> => {
		const built = codecBuilder(options);
		return makeVersionedValidatedCodec(
			options,
			new Set([codecVersion.formatVersion]),
			built.schema,
			built,
		);
	};

	return {
		minVersionForCollab: codecVersion.minVersionForCollab,
		formatVersion: codecVersion.formatVersion,
		codec,
	};
}

/**
 * Creates a codec which dispatches to the appropriate member of a codec family based on the `minVersionForCollab` for encode and the
 * version number in data it encounters for decode.
 * @privateRemarks
 * This is a two stage builder so the first stage can encapsulate all codec specific details and the second can bring in configuration.
 */
export class ClientVersionDispatchingCodecBuilder<
	Name extends CodecName,
	TDecoded,
	TContext,
	TFormatVersion extends FormatVersion,
	TBuildOptions extends CodecWriteOptions,
> {
	public readonly registry: readonly NormalizedCodecVersion<
		TDecoded,
		TContext,
		TFormatVersion,
		TBuildOptions
	>[];

	/**
	 * Use {@link ClientVersionDispatchingCodecBuilder.build} to create an instance of this class.
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
		public readonly name: Name,
		/**
		 * The registry of codecs which this builder can use to encode and decode data.
		 */
		inputRegistry: readonly CodecVersion<TDecoded, TContext, TFormatVersion, TBuildOptions>[],
	) {
		type Normalized = NormalizedCodecVersion<
			TDecoded,
			TContext,
			TFormatVersion,
			TBuildOptions
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
					codec.minVersionForCollab === undefined ||
					typeof codec.formatVersion !== "string" ||
					`unstable format ${JSON.stringify(codec.formatVersion)} (string formats) must not have a minVersionForCollab in ${name}`,
			);
			formats.add(codec.formatVersion);
			const normalizedCodec = normalizeCodecVersion(codec);
			normalizedRegistry.push(normalizedCodec);
			if (codec.minVersionForCollab !== undefined) {
				debugAssert(
					() =>
						!versions.has(codec.minVersionForCollab) ||
						`Codec ${name} has multiple entries for version ${JSON.stringify(codec.minVersionForCollab)}`,
				);
				versions.add(codec.minVersionForCollab);
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
	 * Applies the provided options to the codec registry to produce a list of evaluated codecs.
	 * @remarks
	 * This is used by build, which is what production code should use.
	 * This is only exposed for testing purposes.
	 */
	public applyOptions(
		options: TBuildOptions,
	): EvaluatedCodecVersion<TDecoded, TContext, TFormatVersion>[] {
		return this.registry.map((codec) => ({
			minVersionForCollab: codec.minVersionForCollab,
			formatVersion: codec.formatVersion,
			codec: codec.codec(options),
		}));
	}

	/**
	 * Produce a single codec which can read any supported format, and writes a version selected based on the provided options.
	 */
	public build(
		options: TBuildOptions,
	): IJsonCodec<TDecoded, JsonCompatibleReadOnly, JsonCompatibleReadOnly, TContext> {
		const applied = this.applyOptions(options);
		const writeVersion = getWriteVersion(this.name, options, applied);
		const fromFormatVersion = new Map<
			FormatVersion,
			EvaluatedCodecVersion<TDecoded, TContext, TFormatVersion>
		>(applied.map((codec) => [codec.formatVersion, codec]));
		return {
			encode: (data: TDecoded, context: TContext): JsonCompatibleReadOnly => {
				return writeVersion.codec.encode(data, context);
			},
			decode: (data: JsonCompatibleReadOnly, context: TContext): TDecoded => {
				const versioned = data as Partial<Versioned>;
				const codec = fromFormatVersion.get(versioned.version);
				if (codec === undefined) {
					throw new UsageError(
						`Unsupported version ${versioned.version} encountered while decoding ${this.name} data. Supported versions for this data are: ${versionList(applied)}.
The client which encoded this data likely specified an "minVersionForCollab" value which corresponds to a version newer than the version of this client ("${pkgVersion}").`,
					);
				}
				return codec.codec.decode(data, context);
			},
		};
	}

	public getCodecTree(clientVersion: MinimumVersionForCollab): CodecTree {
		// TODO: add support for children codecs.
		const selected = getWriteVersionNoOverrides(this.registry, clientVersion);
		return {
			name: this.name,
			version: selected.formatVersion,
		};
	}

	/**
	 * Builds a ClientVersionDispatchingCodecBuilder from the provided registry.
	 * @remarks
	 * This static method infers the types of the builder from the provided registry,
	 * making it easier to create builders without needing to explicitly specify all type parameters.
	 * This gets better type inference than the constructor.
	 */
	// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
	public static build<
		Name extends CodecName,
		Entry extends CodecVersion<unknown, unknown, FormatVersion, never>,
	>(name: Name, inputRegistry: readonly Entry[]) {
		type TDecoded2 =
			Entry extends CodecVersion<infer D, unknown, FormatVersion, never> ? D : never;
		type TContext2 =
			Entry extends CodecVersion<unknown, infer C, FormatVersion, never> ? C : never;
		type TFormatVersion2 =
			Entry extends CodecVersion<unknown, unknown, infer F, never> ? F : never;
		type TBuildOptions2 =
			Entry extends CodecVersion<unknown, unknown, FormatVersion, infer B> ? B : never;

		type CodecFinal = CodecVersion<
			TDecoded2,
			// If it does not matter what context is provided, undefined is fine, so allow it to be omitted.
			unknown extends TContext2 ? void : TContext2,
			TFormatVersion2,
			TBuildOptions2
		>;

		const input = inputRegistry as readonly unknown[] as readonly CodecFinal[];

		const builder = new ClientVersionDispatchingCodecBuilder<
			Name,
			TDecoded2,
			unknown extends TContext2 ? void : TContext2,
			TFormatVersion2,
			TBuildOptions2
		>(name, input);
		return builder;
	}
}

/**
 * Selects which format should be used when writing data.
 * @remarks
 * This either uses the override specified in the options, or selects the newest format compatible with the provided minVersionForCollab.
 */
function getWriteVersion<T extends CodecVersionBase>(
	name: CodecName,
	options: CodecWriteOptions,
	versions: readonly T[],
): T {
	if (options.writeVersionOverrides?.has(name) === true) {
		const selectedFormatVersion = options.writeVersionOverrides.get(name);
		const selected = versions.find((codec) => codec.formatVersion === selectedFormatVersion);
		if (selected === undefined) {
			throw new UsageError(
				`Codec "${name}" does not support requested format version ${JSON.stringify(selectedFormatVersion)}. Supported versions are: ${versionList(versions)}.`,
			);
		} else if (options.allowPossiblyIncompatibleWriteVersionOverrides !== true) {
			const selectedMinVersionForCollab = selected.minVersionForCollab;
			if (selectedMinVersionForCollab === undefined) {
				throw new UsageError(
					`Codec "${name}" does not support requested format version ${JSON.stringify(selectedFormatVersion)} because it has minVersionForCollab undefined. Use "allowPossiblyIncompatibleWriteVersionOverrides" to suppress this error if appropriate.`,
				);
			} else if (gt(selectedMinVersionForCollab, options.minVersionForCollab)) {
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
function getWriteVersionNoOverrides<T extends CodecVersionBase>(
	versions: readonly T[],
	minVersionForCollab: MinimumVersionForCollab,
): T {
	const stableVersions: [MinimumMinorSemanticVersion | MinimumVersionForCollab, T][] = [];
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
function versionList(versions: readonly CodecVersionBase[]): string {
	return JSON.stringify(Array.from(versions, (codec) => codec.formatVersion));
}
