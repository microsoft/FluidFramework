/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, oob } from "@fluidframework/core-utils/internal";
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
	type IMultiFormatCodec,
	makeCodecFamily,
	type CodecName,
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

export interface CodecVersion<TDecoded, TContext> {
	readonly formatVersion: FormatVersion;
	/**
	 * The oldest client version which can decode data encoded with this codec.
	 * @remarks
	 * If `undefined`, this codec will not be selected for encoding data based on a {@link FluidClientVersion}.
	 */
	readonly oldestCompatibleClient: FluidClientVersion | undefined;
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
export class ClientVersionDispatchingCodecBuilder<Name extends CodecName, TDecoded, TContext> {
	/**
	 * The registry of codecs known about by this builder.
	 * @remarks
	 * Exposed for testing purposes.
	 */
	public readonly registry: readonly CodecVersion<TDecoded, TContext>[];

	private readonly fromFormatVersion: ReadonlyMap<
		FormatVersion,
		CodecVersion<TDecoded, TContext>
	>;

	public constructor(
		/**
		 * See {@link CodecName}.
		 */
		public readonly name: Name,
		/**
		 * The registry of codecs which this builder can use to encode and decode data.
		 * @remarks
		 * Must be in order of increasing `oldestCompatibleClient` when `oldestCompatibleClient` is defined.
		 * If multiple codecs have the same `oldestCompatibleClient`, will use the last one if that `oldestCompatibleClient` version is selected.
		 */
		...registry: readonly CodecVersion<TDecoded, TContext>[]
	) {
		const fromFormatVersion: Map<FormatVersion, CodecVersion<TDecoded, TContext>> = new Map();

		let oldest = Number.NEGATIVE_INFINITY;
		for (const codec of registry) {
			if (codec.oldestCompatibleClient !== undefined) {
				assert(codec.oldestCompatibleClient >= oldest, "Codecs out of order");
				oldest = codec.oldestCompatibleClient;
			}
			assert(
				!fromFormatVersion.has(codec.formatVersion),
				"Codec versions must have unique format versions",
			);
			fromFormatVersion.set(codec.formatVersion, codec);
		}
		assert(
			oldest > Number.NEGATIVE_INFINITY,
			"At least one CodecVersion must allow writing data",
		);
		this.registry = registry;
		this.fromFormatVersion = fromFormatVersion;
	}

	private getWriteVersion(options: CodecWriteOptions): FormatVersion {
		if (
			options.writeVersionOverrides !== undefined &&
			options.writeVersionOverrides.has(this.name)
		) {
			const selectedFormatVersion = options.writeVersionOverrides.get(this.name);
			const selected = this.fromFormatVersion.get(selectedFormatVersion);
			if (selected === undefined) {
				throw new UsageError(
					`Codec "${this.name}" does not support requested format version ${selectedFormatVersion}. Supported versions are: ${Array.from(
						this.fromFormatVersion.keys(),
					).join(", ")}.`,
				);
			} else if (options.allowPossiblyIncompatibleWriteVersionOverrides !== true) {
				if (selected.oldestCompatibleClient === undefined) {
					throw new UsageError(
						`Codec "${this.name}" does not support requested format version ${selectedFormatVersion} because it does not specify an oldest compatible client. Use "allowPossiblyIncompatibleOverrides" to override this error.`,
					);
				} else if (selected.oldestCompatibleClient > options.oldestCompatibleClient) {
					throw new UsageError(
						`Codec "${this.name}" does not support requested format version ${selectedFormatVersion} because it is only compatible back to client version ${selected.oldestCompatibleClient} and the requested oldest compatible client was ${options.oldestCompatibleClient}. Use "allowPossiblyIncompatibleOverrides" to override this error.`,
					);
				}
			}

			return options.writeVersionOverrides.get(this.name);
		}
		for (let index = this.registry.length - 1; index >= 0; index--) {
			const codec = this.registry[index] ?? oob();
			if (codec.oldestCompatibleClient !== undefined) {
				if (codec.oldestCompatibleClient <= options.oldestCompatibleClient) {
					return codec.formatVersion;
				}
			}
		}
		throw new UsageError(`No codec found compatible with ${options.oldestCompatibleClient}.`);
	}

	/**
	 * Generate the codec family for this builder.
	 * @remarks
	 * This is used by {@link build}, and only exposed to enable inspection and testing of this codec.
	 */
	public getFamily(options: CodecWriteOptions): ICodecFamily<TDecoded, TContext> {
		const family = makeCodecFamily(
			this.registry.map((codec) => {
				const final = typeof codec.codec === "function" ? codec.codec(options) : codec.codec;
				return [codec.formatVersion, final];
			}),
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
