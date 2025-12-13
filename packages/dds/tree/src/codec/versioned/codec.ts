/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import {
	getConfigForMinVersionForCollabIterable,
	type ConfigMapEntry,
	type MinimumMinorSemanticVersion,
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
	ensureBinaryEncoding,
	type CodecTree,
} from "../codec.js";

import { Versioned } from "./format.js";
import { pkgVersion } from "../../packageVersion.js";
import type { MinimumVersionForCollab } from "@fluidframework/runtime-definitions/internal";

function makeVersionedCodec<
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

/**
 * TODO: users of this should migrate to {@link ClientVersionDispatchingCodecBuilder}.
 */
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
 *
 * TODO: {@link ClientVersionDispatchingCodecBuilder} should get support for extra decode only entries and/or unstable formats (codecs without a minVersionForCollab that will never be selected for write unless overridden).
 * Once done, users of this should migrate to ClientVersionDispatchingCodecBuilder and this function can be simplified.
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
 * TODO: Users of this should migrate to {@link ClientVersionDispatchingCodecBuilder} so that the actual format version used can be encapsulated.
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

export interface CodecVersionBase<
	T = unknown,
	TFormatVersion extends FormatVersion = FormatVersion,
> {
	readonly formatVersion: TFormatVersion;
	readonly codec: T;
}

export interface CodecVersion<
	TDecoded,
	TContext,
	TFormatVersion extends FormatVersion,
	TBuildOptions extends CodecWriteOptions,
> extends CodecVersionBase<
		| CodecType<TDecoded, TContext>
		| ((options: TBuildOptions) => CodecType<TDecoded, TContext>),
		TFormatVersion
	> {}

export interface NormalizedCodecVersion<
	TDecoded,
	TContext,
	TFormatVersion extends FormatVersion,
	TBuildOptions extends CodecWriteOptions,
> extends CodecVersionBase<
		(
			options: TBuildOptions,
		) => IMultiFormatCodec<TDecoded, JsonCompatibleReadOnly, JsonCompatibleReadOnly, TContext>,
		TFormatVersion
	> {}

export interface EvaluatedCodecVersion<
	TDecoded,
	TContext,
	TFormatVersion extends FormatVersion,
> extends CodecVersionBase<
		IMultiFormatCodec<TDecoded, JsonCompatibleReadOnly, JsonCompatibleReadOnly, TContext>,
		TFormatVersion
	> {}

function normalizeCodecVersion<
	TDecoded,
	TContext,
	TFormatVersion extends FormatVersion,
	TBuildOptions extends CodecWriteOptions,
>(
	codecVersion: CodecVersion<TDecoded, TContext, TFormatVersion, TBuildOptions>,
): NormalizedCodecVersion<TDecoded, TContext, TFormatVersion, TBuildOptions> {
	const codecBuilder: (options: TBuildOptions) => CodecType<TDecoded, TContext> =
		typeof codecVersion.codec === "function"
			? codecVersion.codec
			: () => codecVersion.codec as CodecType<TDecoded, TContext>;
	const codec = (
		options: TBuildOptions,
	): IMultiFormatCodec<TDecoded, JsonCompatibleReadOnly, JsonCompatibleReadOnly, TContext> => {
		const built = codecBuilder(options);
		return ensureBinaryEncoding(built);
	};

	return {
		formatVersion: codecVersion.formatVersion,
		codec,
	};
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
	TBuildOptions extends CodecWriteOptions,
> {
	public readonly registry: ReadonlyMap<
		MinimumVersionForCollab,
		NormalizedCodecVersion<TDecoded, TContext, TFormatVersion, TBuildOptions>
	>;

	/**
	 * Use {@link ClientVersionDispatchingCodecBuilder.build} to create an instance of this class.
	 */
	private constructor(
		/**
		 * See {@link CodecName}.
		 */
		public readonly name: Name,
		/**
		 * The registry of codecs which this builder can use to encode and decode data.
		 */
		inputRegistry: ConfigMapEntry<
			CodecVersion<TDecoded, TContext, TFormatVersion, TBuildOptions>
		>,
	) {
		type Normalized = NormalizedCodecVersion<
			TDecoded,
			TContext,
			TFormatVersion,
			TBuildOptions
		>;
		const normalizedRegistry = new Map<MinimumVersionForCollab, Normalized>();

		for (const [minVersionForCollab, codec] of Object.entries(inputRegistry) as Iterable<
			[
				MinimumVersionForCollab,
				CodecVersion<TDecoded, TContext, TFormatVersion, TBuildOptions>,
			]
		>) {
			const normalizedCodec = normalizeCodecVersion(codec);
			normalizedRegistry.set(minVersionForCollab, normalizedCodec);
		}

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
	): [MinimumVersionForCollab, EvaluatedCodecVersion<TDecoded, TContext, TFormatVersion>][] {
		return Array.from(
			this.registry,
			([version, codec]) =>
				[
					version,
					{
						formatVersion: codec.formatVersion,
						codec: codec.codec(options),
					},
				] as const,
		);
	}

	public build(
		options: TBuildOptions,
	): IJsonCodec<TDecoded, JsonCompatibleReadOnly, JsonCompatibleReadOnly, TContext> {
		const applied = this.applyOptions(options);
		const writeVersion = getWriteVersion(this.name, options, applied);
		const fromFormatVersion = new Map<
			FormatVersion,
			EvaluatedCodecVersion<TDecoded, TContext, TFormatVersion>
		>(applied.map(([_version, codec]) => [codec.formatVersion, codec]));
		return {
			encode: (data: TDecoded, context: TContext): JsonCompatibleReadOnly => {
				return writeVersion.codec.json.encode(data, context);
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
				const result = codec.codec.json.decode(data, context);
				return result;
			},
		};
	}

	public getCodecTree(clientVersion: MinimumVersionForCollab): CodecTree {
		// TODO: add support for children codecs.
		const selected = getConfigForMinVersionForCollabIterable(clientVersion, this.registry);
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
	public static build<
		Name extends CodecName,
		TDecoded2,
		TContext2,
		TFormatVersion2 extends FormatVersion,
		TBuildOptions2 extends CodecWriteOptions,
		TEntry extends CodecVersion<TDecoded2, TContext2, TFormatVersion2, TBuildOptions2>,
	>(
		name: Name,
		inputRegistry: ConfigMapEntry<TEntry> &
			ConfigMapEntry<{
				[key in keyof TEntry]: key extends keyof CodecVersionBase ? TEntry[key] : never;
			}>,
	): ClientVersionDispatchingCodecBuilder<
		Name,
		TDecoded2,
		TContext2,
		TFormatVersion2,
		TBuildOptions2
	> {
		return new ClientVersionDispatchingCodecBuilder(name, inputRegistry);
	}
}

function getWriteVersion<T extends CodecVersionBase>(
	name: CodecName,
	options: CodecWriteOptions,
	versions: readonly [MinimumMinorSemanticVersion | MinimumVersionForCollab, T][],
): T {
	if (options.writeVersionOverrides?.has(name) === true) {
		const selectedFormatVersion = options.writeVersionOverrides.get(name);
		const selected = versions.find(
			([_v, codec]) => codec.formatVersion === selectedFormatVersion,
		);
		if (selected === undefined) {
			throw new UsageError(
				`Codec "${name}" does not support requested format version ${selectedFormatVersion}. Supported versions are: ${versionList(versions)}.`,
			);
		} else if (options.allowPossiblyIncompatibleWriteVersionOverrides !== true) {
			const selectedMinVersionForCollab = selected[0];
			if (selectedMinVersionForCollab === undefined) {
				throw new UsageError(
					`Codec "${name}" does not support requested format version ${selectedFormatVersion} because it does not specify an oldest compatible client. Use "allowPossiblyIncompatibleWriteVersionOverrides" to override this error.`,
				);
			} else if (gt(selectedMinVersionForCollab, options.minVersionForCollab)) {
				throw new UsageError(
					`Codec "${name}" does not support requested format version ${selectedFormatVersion} because it is only compatible back to client version ${selectedMinVersionForCollab} and the requested oldest compatible client was ${options.minVersionForCollab}. Use "allowPossiblyIncompatibleWriteVersionOverrides" to override this error.`,
				);
			}
		}

		return selected[1];
	}
	const result: T = getConfigForMinVersionForCollabIterable(
		options.minVersionForCollab,
		versions,
	);
	return result;
}

function versionList(
	versions: readonly [
		MinimumMinorSemanticVersion | MinimumVersionForCollab,
		CodecVersionBase,
	][],
): string {
	return `${Array.from(versions, ([_v, codec]) => codec.formatVersion).join(", ")}`;
}
