/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IsoBuffer, bufferToString } from "@fluid-internal/client-utils";
import { assert, fail } from "@fluidframework/core-utils/internal";
import type { Static, TAnySchema, TSchema } from "@sinclair/typebox";

import type { ChangeEncodingContext } from "../core/index.js";
import type { JsonCompatibleReadOnly } from "../util/index.js";

/**
 * Translates decoded data to encoded data.
 * @remarks Typically paired with an {@link IEncoder}.
 */
export interface IEncoder<TDecoded, TEncoded, TContext> {
	/**
	 * Encodes `obj` into some encoded format.
	 */
	encode(obj: TDecoded, context: TContext): TEncoded;
}

/**
 * Translates encoded data to decoded data.
 * @remarks Typically paired with an {@link IEncoder}.
 */
export interface IDecoder<TDecoded, TEncoded, TContext> {
	/**
	 * Decodes `obj` from some encoded format.
	 */
	decode(obj: TEncoded, context: TContext): TDecoded;
}

/**
 * Validates data complies with some particular schema.
 * Implementations are typically created by a {@link JsonValidator}.
 * @alpha @input
 */
export interface SchemaValidationFunction<Schema extends TSchema> {
	/**
	 * Returns whether the data matches a schema.
	 */
	check(data: unknown): data is Static<Schema>;
}

/**
 * JSON schema validator compliant with draft 6 schema. See https://json-schema.org.
 * @alpha @input
 */
export interface JsonValidator {
	/**
	 * Compiles the provided JSON schema into a validator for that schema.
	 * @param schema - A valid draft 6 JSON schema
	 * @remarks IFluidHandles--which have circular property references--are used in various places in SharedTree's persisted
	 * format. Handles should only be contained in sections of data which are validated against the empty schema `{}`
	 * (see https://datatracker.ietf.org/doc/html/draft-wright-json-schema-01#section-4.4).
	 *
	 * Implementations of `JsonValidator` must therefore tolerate these values, despite the input not being valid JSON.
	 */
	compile<Schema extends TSchema>(schema: Schema): SchemaValidationFunction<Schema>;
}

/**
 * Options relating to handling of persisted data.
 *
 * @see {@link CodecWriteOptions} for options that are specific to encoding data.
 * @alpha @input
 */
export interface ICodecOptions {
	/**
	 * {@link JsonValidator} which SharedTree uses to validate persisted data it reads & writes
	 * matches the expected encoded format (i.e. the wire format for ops and summaries).
	 *
	 * See {@link noopValidator} and {@link typeboxValidator} for out-of-the-box implementations.
	 *
	 * This option is not "on-by-default" because JSON schema validation comes with a small but noticeable
	 * runtime performance cost, and popular schema validation libraries have relatively large bundle size.
	 *
	 * SharedTree users are still encouraged to use a non-trivial validator (i.e. not `noopValidator`)
	 * whenever reasonable: it gives better fail-fast behavior when unexpected encoded data is found,
	 * which reduces the risk of unrecoverable data corruption.
	 */
	readonly jsonValidator: JsonValidator;
}

/**
 * Options relating to encoding of persisted data.
 * @remarks
 * Extends {@link ICodecOptions} with options that are specific to encoding data.
 * @alpha @input
 */
export interface CodecWriteOptions extends ICodecOptions {
	/**
	 * The minimum version of the Fluid Framework client output must be encoded to be compatible with.
	 * @remarks
	 * This is used to ensure that the the output from this codec can be used with older versions of the Fluid Framework client.
	 * This includes both concurrent collaboration, and an older version opening the document later.
	 *
	 * Note that versions older than this should not result in data corruption if they access the data:
	 * the data's format should be versioned and if they can't handle the format they should error.
	 */
	readonly oldestCompatibleClient: FluidClientVersion;

	/**
	 * Overrides the version of the codec to use for encoding.
	 * @remarks
	 * Without an override, the selected version will be based on {@link CodecWriteOptions.oldestCompatibleClient}.
	 */
	readonly writeVersionOverrides?: ReadonlyMap<CodecName, FormatVersion>;

	/**
	 * If true, suppress errors when `writeVersionOverrides` selects a version which may not be compatible with the `oldestCompatibleClient`
	 */
	readonly allowPossiblyIncompatibleWriteVersionOverrides?: boolean;
}

/**
 * `TContext` allows passing context to the codec which may configure how data is encoded/decoded.
 * This parameter is typically used for:
 * - Codecs which can pick from multiple encoding options, and imbue the encoded data with information about which option was used.
 * The caller of such a codec can provide context about which encoding choice to make as part of the `encode` call without creating
 * additional codecs. Note that this pattern can always be implemented by having the caller create multiple codecs and selecting the
 * appropriate one, but depending on API layering this might be less ergonomic.
 * - Context for the object currently being encoded, which might enable more efficient encoding. When used in this fashion, the codec author
 * should be careful to include the context somewhere in the encoded data such that decoding can correctly round-trip.
 * For example, a composed set of codecs could implement a form of [dictionary coding](https://en.wikipedia.org/wiki/Dictionary_coder)
 * using a context map which was created by the top-level codec and passed to the inner codecs.
 * This pattern is used:
 * - To avoid repeatedly encoding session ids on commits (only recording it once at the top level)
 * @remarks `TEncoded` should always be valid Json (i.e. not contain functions), but due to TypeScript's handling
 * of index signatures and `JsonCompatibleReadOnly`'s index signature in the Json object case, specifying this as a
 * type-system level constraint makes code that uses this interface more difficult to write.
 *
 * If provided, `TValidate` allows the input type passed to `decode` to be different than `TEncoded`.
 * This is useful when, for example, the type being decoded is `unknown` and must be validated to be a `TEncoded` before being decoded to a `TDecoded`.
 */
export interface IJsonCodec<
	TDecoded,
	TEncoded = JsonCompatibleReadOnly,
	TValidate = TEncoded,
	TContext = void,
> extends IEncoder<TDecoded, TEncoded, TContext>,
		IDecoder<TDecoded, TValidate, TContext> {
	encodedSchema?: TAnySchema;
}

/**
 * @remarks TODO: We might consider using DataView or some kind of writer instead of IsoBuffer.
 */
export interface IBinaryCodec<TDecoded, TContext = void>
	extends IEncoder<TDecoded, IsoBuffer, TContext>,
		IDecoder<TDecoded, IsoBuffer, TContext> {}

/**
 * Contains knowledge of how to encode some in-memory type into JSON and binary formats,
 * as well as how to decode those representations.
 *
 * @remarks Codecs are typically used in shared-tree to convert data into some persisted format.
 * For this common use case, any format for encoding that was ever actually used needs to
 * be supported for decoding in all future code versions.
 *
 * Using an {@link ICodecFamily} is the recommended strategy for managing this support, keeping in
 * mind evolution of encodings over time.
 */
export interface IMultiFormatCodec<
	TDecoded,
	TJsonEncoded extends JsonCompatibleReadOnly = JsonCompatibleReadOnly,
	TJsonValidate = TJsonEncoded,
	TContext = void,
> {
	json: IJsonCodec<TDecoded, TJsonEncoded, TJsonValidate, TContext>;
	binary: IBinaryCodec<TDecoded, TContext>;

	/** Ensures multi-format codecs cannot also be single-format codecs. */
	encode?: never;
	/** Ensures multi-format codecs cannot also be single-format codecs. */
	decode?: never;
}

/**
 * Represents a family of codecs that can be used to encode and decode data in different formats.
 * The family is identified by a format version, which is typically used to select the codec to use.
 *
 * Separating codecs into families rather than having a single codec support multiple versions (i.e. currying
 * the `formatVersion` parameter)
 * allows avoiding some duplicate work at encode/decode time, since the vast majority of document usage will not
 * involve mixed format versions.
 *
 * @privateRemarks - This interface currently assumes all codecs in a family require the same encode/decode context,
 * which isn't necessarily true.
 * This may need to be relaxed in the future.
 */
export interface ICodecFamily<TDecoded, TContext = void> {
	/**
	 * @returns a codec that can be used to encode and decode data in the specified format.
	 * @throws - if the format version is not supported by this family.
	 * @remarks Implementations should typically emit telemetry (either indirectly by throwing a well-known error with
	 * logged properties or directly using some logger) when a format version is requested that is not supported.
	 * This ensures that applications can diagnose compatibility issues.
	 */
	resolve(
		formatVersion: FormatVersion,
	): IMultiFormatCodec<TDecoded, JsonCompatibleReadOnly, JsonCompatibleReadOnly, TContext>;

	/**
	 * @returns an iterable of all format versions supported by this family.
	 */
	getSupportedFormats(): Iterable<FormatVersion>;
}

/**
 * A version stamp for encoded data.
 * @remarks
 * Undefined is tolerated to enable the scenario where data was not initially versioned.
 * @alpha
 */
export type FormatVersion = number | undefined;

/**
 * A unique name given to this codec family.
 * @remarks
 * This is not persisted: it is only used to specify version overrides and in errors.
 * @alpha
 */
export type CodecName = string;

/**
 * Creates a codec family from a registry of codecs.
 * Any codec that is not a {@link IMultiFormatCodec} will be wrapped with a default binary encoding.
 */
export function makeCodecFamily<TDecoded, TContext>(
	registry: Iterable<
		[
			formatVersion: FormatVersion,
			codec:
				| IMultiFormatCodec<TDecoded, JsonCompatibleReadOnly, JsonCompatibleReadOnly, TContext>
				| IJsonCodec<TDecoded, JsonCompatibleReadOnly, JsonCompatibleReadOnly, TContext>,
		]
	>,
): ICodecFamily<TDecoded, TContext> {
	const codecs: Map<
		FormatVersion,
		IMultiFormatCodec<TDecoded, JsonCompatibleReadOnly, JsonCompatibleReadOnly, TContext>
	> = new Map();
	for (const [formatVersion, codec] of registry) {
		if (codecs.has(formatVersion)) {
			fail(0xabf /* Duplicate codecs specified. */);
		}
		codecs.set(formatVersion, ensureBinaryEncoding(codec));
	}

	return {
		resolve(
			formatVersion: number,
		): IMultiFormatCodec<TDecoded, JsonCompatibleReadOnly, JsonCompatibleReadOnly, TContext> {
			const codec = codecs.get(formatVersion);
			assert(codec !== undefined, 0x5e6 /* Requested coded for unsupported format. */);
			return codec;
		},
		getSupportedFormats(): Iterable<FormatVersion> {
			return codecs.keys();
		},
	};
}

class DefaultBinaryCodec<TDecoded, TContext> implements IBinaryCodec<TDecoded, TContext> {
	public constructor(
		private readonly jsonCodec: IJsonCodec<TDecoded, unknown, unknown, TContext>,
	) {}

	public encode(change: TDecoded, context: TContext): IsoBuffer {
		const jsonable = this.jsonCodec.encode(change, context);
		const json = JSON.stringify(jsonable);
		return IsoBuffer.from(json);
	}

	public decode(change: IsoBuffer, context: TContext): TDecoded {
		const json = bufferToString(change, "utf8");
		const jsonable = JSON.parse(json);
		return this.jsonCodec.decode(jsonable, context);
	}
}

function isJsonCodec<TDecoded, TContext>(
	codec:
		| IMultiFormatCodec<TDecoded, JsonCompatibleReadOnly, JsonCompatibleReadOnly, TContext>
		| IJsonCodec<TDecoded, JsonCompatibleReadOnly, JsonCompatibleReadOnly, TContext>,
): codec is IJsonCodec<TDecoded, JsonCompatibleReadOnly, JsonCompatibleReadOnly, TContext> {
	return typeof codec.encode === "function" && typeof codec.decode === "function";
}

/**
 * Constructs a {@link IMultiFormatCodec} from a `IJsonCodec` using a generic binary encoding that simply writes
 * the json representation of the object to a buffer.
 */
export function withDefaultBinaryEncoding<TDecoded, TContext>(
	jsonCodec: IJsonCodec<TDecoded, JsonCompatibleReadOnly, JsonCompatibleReadOnly, TContext>,
): IMultiFormatCodec<TDecoded, JsonCompatibleReadOnly, JsonCompatibleReadOnly, TContext> {
	return {
		json: jsonCodec,
		binary: new DefaultBinaryCodec(jsonCodec),
	};
}

/**
 * Ensures that the provided single or multi-format codec has a binary encoding.
 * Adapts the json encoding using {@link withDefaultBinaryEncoding} if necessary.
 */
export function ensureBinaryEncoding<TDecoded, TContext>(
	codec:
		| IMultiFormatCodec<TDecoded, JsonCompatibleReadOnly, JsonCompatibleReadOnly, TContext>
		| IJsonCodec<TDecoded, JsonCompatibleReadOnly, JsonCompatibleReadOnly, TContext>,
): IMultiFormatCodec<TDecoded, JsonCompatibleReadOnly, JsonCompatibleReadOnly, TContext> {
	return isJsonCodec(codec) ? withDefaultBinaryEncoding(codec) : codec;
}

/**
 * Codec for objects which carry no information.
 */
export const unitCodec: IMultiFormatCodec<
	0,
	JsonCompatibleReadOnly,
	JsonCompatibleReadOnly,
	unknown
> = {
	json: {
		encode: () => 0,
		decode: () => 0,
	},
	binary: {
		encode: () => IsoBuffer.from(""),
		decode: () => 0,
	},
};

/**
 * Wraps a codec with JSON schema validation for its encoded type.
 * @returns An {@link IJsonCodec} which validates the data it encodes and decodes matches the provided schema.
 */
export function withSchemaValidation<
	TInMemoryFormat,
	EncodedSchema extends TSchema,
	TEncodedFormat = JsonCompatibleReadOnly,
	TValidate = TEncodedFormat,
	TContext = ChangeEncodingContext,
>(
	schema: EncodedSchema,
	codec: IJsonCodec<TInMemoryFormat, TEncodedFormat, TValidate, TContext>,
	validator?: JsonValidator,
): IJsonCodec<TInMemoryFormat, TEncodedFormat, TValidate, TContext> {
	if (!validator) {
		return codec;
	}
	const compiledFormat = validator.compile(schema);
	return {
		encode: (obj: TInMemoryFormat, context: TContext): TEncodedFormat => {
			const encoded = codec.encode(obj, context);
			if (!compiledFormat.check(encoded)) {
				fail(0xac0 /* Encoded schema should validate */);
			}
			return encoded;
		},
		decode: (encoded: TValidate, context: TContext): TInMemoryFormat => {
			if (!compiledFormat.check(encoded)) {
				fail(0xac1 /* Encoded schema should validate */);
			}
			// TODO: would be nice to provide a more specific validate type to the inner codec than the outer one gets.
			return codec.decode(encoded, context) as unknown as TInMemoryFormat;
		},
	};
}

/**
 * Versions of Fluid Framework client packages.
 * @remarks
 * Used to express compatibility requirements by indicating the oldest version with which compatibility must be maintained.
 *
 * When no compatibility-impacting change is made in a given version, the value associated with its enum entry may point to the older version which it's fully compatible with.
 * Note that this can change if a future version of the framework introduces an option to use something which is only supported at a particular version. In which case, the values of the enum may shift,
 * but the semantics of keys in this enum will not change.
 *
 * Do not depend on the value of this enums's entries: only depend on the keys (enum members) themselves.
 *
 * Some release may also be omitted if there is currently no need to express that specific version.
 * If the need arises, they might be added in the future.
 *
 * @privateRemarks
 * Entries in these enums should document the user facing impact of opting into a particular version.
 * For example, document if there is an encoding efficiency improvement of oping into that version or newer.
 * Versions with no notable impact can be omitted.
 *
 * These use numeric values for easy threshold comparisons.
 * Without zero padding, version 2.10 is treated as 2.1, which is numerically less than 2.2.
 * Adding leading zeros to the minor version ensures correct comparisons.
 * For example, version 2.20.0 is encoded as 2.020, and version 2.2.0 is encoded as 2.002.
 * For example FF 2.20.0 is encoded as 2.020 and FF 2.2.0 is encoded as 2.002.
 *
 * Three digits was selected as that will likely be enough, while two digits could easily be too few.
 * If three digits ends up being too few, minor releases of 1000 and higher
 * could still be handled using something like 2.999_00001 without having to change the lower releases.
 *
 * This scheme assumes a single version will always be enough to communicate compatibility.
 * For this to work, compatibility has to be strictly increasing.
 * If this is violated (for example a subset of incompatible features from 3.x that are not in 3.0 are back ported to 2.x),
 * a more complex scheme may be needed to allow safely opting into incompatible features in those cases:
 * such a system can be added if/when its needed since it will be opt in and thus non-breaking.
 *
 * TODO: this should likely be defined higher in the stack and specified when creating the container, possibly as part of its schema.
 * TODO: compatibility requirements for how this enum can and cannot be changed should be clarified when/if it's used across multiple layers in the stack.
 * For example, if needed, would adding more leading zeros to the minor version break things.
 * @alpha
 */
export enum FluidClientVersion {
	/**
	 * Fluid Framework Client 1.4 and newer.
	 * @remarks
	 * This opts into support for the 1.4 LTS branch.
	 * @privateRemarks
	 * As long as this code is in Tree, there is no reason to have this option as SharedTree did not exist in 1.4.
	 */
	// v1_4 = 1.004,

	/** Fluid Framework Client 2.0 and newer. */
	v2_0 = 2.0,

	/** Fluid Framework Client 2.1 and newer. */
	// If we think we might want to start allowing opting into something that landed in 2.1 (without opting into something newer),
	// we could add an entry like this to allow users to indicate that they can be opted in once we are ready,
	// then update it to "2.001" once we actually have the opt in working.
	// v2_1 = v2_0,

	/** Fluid Framework Client 2.41 and newer. */
	// If we land some new formats in 2.41, we can enable selecting
	// v2_41 = 2.041,

	/**
	 * Enable unreleased and unfinished features.
	 * @remarks
	 * Using this value can result in documents which can not be opened in future versions of the framework.
	 * It can also result in data corruption by enabling unfinished features which may not handle all cases correctly.
	 *
	 * This can be used with specific APIs when the caller has knowledge of what specific features those APIs will be opted into with it.
	 * This is useful for testing features before they are released, but should not be used in production code.
	 */
	EnableUnstableFeatures = Number.POSITIVE_INFINITY,
}

/**
 * An up to date version which includes all the important stable features.
 * @remarks
 * Use for cases when data is not persisted and thus would only ever be read by the current version of the framework.
 *
 * @privateRemarks
 * Update as needed.
 * TODO: Consider using packageVersion.ts to keep this current.
 */
export const currentVersion: FluidClientVersion = FluidClientVersion.v2_0;
