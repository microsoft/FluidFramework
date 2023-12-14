/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { bufferToString, IsoBuffer } from "@fluid-internal/client-utils";
import { assert } from "@fluidframework/core-utils";
import type { Static, TAnySchema, TSchema } from "@sinclair/typebox";
import { fail, JsonCompatibleReadOnly } from "../util";

/**
 * Translates decoded data to encoded data.
 * @remarks Typically paired with an {@link IEncoder}.
 */
export interface IEncoder<TDecoded, TEncoded> {
	/**
	 * Encodes `obj` into some encoded format.
	 */
	encode(obj: TDecoded): TEncoded;
}

/**
 * Translates encoded data to decoded data.
 * @remarks Typically paired with an {@link IEncoder}.
 */
export interface IDecoder<TDecoded, TEncoded> {
	/**
	 * Decodes `obj` from some encoded format.
	 */
	decode(obj: TEncoded): TDecoded;
}

/**
 * Validates data complies with some particular schema.
 * Implementations are typically created by a {@link JsonValidator}.
 * @alpha
 */
export interface SchemaValidationFunction<Schema extends TSchema> {
	/**
	 * @returns Whether the data matches a schema.
	 */
	check(data: unknown): data is Static<Schema>;
}

/**
 * JSON schema validator compliant with draft 6 schema. See https://json-schema.org.
 * @alpha
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
 * @alpha
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
 * @remarks `TEncoded` should always be valid Json (i.e. not contain functions), but due to TypeScript's handling
 * of index signatures and `JsonCompatibleReadOnly`'s index signature in the Json object case, specifying this as a
 * type-system level constraint makes code that uses this interface more difficult to write.
 *
 * If provided, `TValidate` allows the input type passed to `decode` to be different than `TEncoded`.
 * This is useful when, for example, the type being decoded is `unknown` and must be validated to be a `TEncoded` before being decoded to a `TDecoded`.
 */
export interface IJsonCodec<TDecoded, TEncoded = JsonCompatibleReadOnly, TValidate = TEncoded>
	extends IEncoder<TDecoded, TEncoded>,
		IDecoder<TDecoded, TValidate> {
	encodedSchema?: TAnySchema;
}

/**
 * TODO: properly integrate context
 */
export type IJsonCodecWithContext<TDecoded, TEncoded, TValidate, TContext> = (
	context: TContext,
) => IJsonCodec<TDecoded, TEncoded, TValidate>;

/**
 * @remarks TODO: We might consider using DataView or some kind of writer instead of IsoBuffer.
 */
export interface IBinaryCodec<TDecoded>
	extends IEncoder<TDecoded, IsoBuffer>,
		IDecoder<TDecoded, IsoBuffer> {}

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
> {
	json: IJsonCodec<TDecoded, TJsonEncoded, TJsonValidate>;
	binary: IBinaryCodec<TDecoded>;

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
 */
export interface ICodecFamily<TDecoded> {
	/**
	 * @returns a codec that can be used to encode and decode data in the specified format.
	 * @throws - if the format version is not supported by this family.
	 * @remarks Implementations should typically emit telemetry (either indirectly by throwing a well-known error with
	 * logged properties or directly using some logger) when a format version is requested that is not supported.
	 * This ensures that applications can diagnose compatibility issues.
	 */
	resolve(formatVersion: number): IMultiFormatCodec<TDecoded>;

	/**
	 * @returns an iterable of all format versions supported by this family.
	 */
	getSupportedFormats(): Iterable<number>;
}

/**
 * Creates a codec family from a registry of codecs.
 * Any codec that is not a {@link IMultiFormatCodec} will be wrapped with a default binary encoding.
 */
export function makeCodecFamily<TDecoded>(
	registry: Iterable<
		[formatVersion: number, codec: IMultiFormatCodec<TDecoded> | IJsonCodec<TDecoded>]
	>,
): ICodecFamily<TDecoded> {
	const codecs: Map<number, IMultiFormatCodec<TDecoded>> = new Map();
	for (const [formatVersion, codec] of registry) {
		if (codecs.has(formatVersion)) {
			fail("Duplicate codecs specified.");
		}
		codecs.set(formatVersion, ensureBinaryEncoding(codec));
	}

	return {
		resolve(formatVersion: number) {
			const codec = codecs.get(formatVersion);
			assert(codec !== undefined, 0x5e6 /* Requested coded for unsupported format. */);
			return codec;
		},
		getSupportedFormats() {
			return codecs.keys();
		},
	};
}

class DefaultBinaryCodec<TDecoded> implements IBinaryCodec<TDecoded> {
	public constructor(private readonly jsonCodec: IJsonCodec<TDecoded>) {}

	public encode(change: TDecoded): IsoBuffer {
		const jsonable = this.jsonCodec.encode(change);
		const json = JSON.stringify(jsonable);
		return IsoBuffer.from(json);
	}

	public decode(change: IsoBuffer): TDecoded {
		const json = bufferToString(change, "utf8");
		const jsonable = JSON.parse(json);
		return this.jsonCodec.decode(jsonable);
	}
}

function isJsonCodec<TDecoded>(
	codec: IMultiFormatCodec<TDecoded> | IJsonCodec<TDecoded>,
): codec is IJsonCodec<TDecoded> {
	return typeof codec.encode === "function" && typeof codec.decode === "function";
}

/**
 * Constructs a {@link IMultiFormatCodec} from a `IJsonCodec` using a generic binary encoding that simply writes
 * the json representation of the object to a buffer.
 */
export function withDefaultBinaryEncoding<TDecoded>(
	jsonCodec: IJsonCodec<TDecoded>,
): IMultiFormatCodec<TDecoded> {
	return {
		json: jsonCodec,
		binary: new DefaultBinaryCodec(jsonCodec),
	};
}

/**
 * Ensures that the provided single or multi-format codec has a binary encoding.
 * Adapts the json encoding using {@link withDefaultBinaryEncoding} if necessary.
 */
export function ensureBinaryEncoding<TDecoded>(
	codec: IMultiFormatCodec<TDecoded> | IJsonCodec<TDecoded>,
): IMultiFormatCodec<TDecoded> {
	return isJsonCodec(codec) ? withDefaultBinaryEncoding(codec) : codec;
}

/**
 * Codec for objects which carry no information.
 */
export const unitCodec: IMultiFormatCodec<0> = {
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
 * Creates a json codec for objects which are just a json compatible value
 * and can be serialized as-is.
 *
 * This type of encoding is only appropriate if the persisted type (which should be defined in a persisted format file)
 * happens to be convenient for in-memory usage as well.
 *
 * @remarks Beware that this API can cause accidental extraneous data in the persisted format.
 * Consider the following example:
 * ```typescript
 * interface MyPersistedType {
 *     foo: string;
 *     id: number;
 * }
 * const MyPersistedType = Type.Object({
 *     foo: Type.String(),
 *     id: Type.Number()
 * });
 *
 * const codec = makeValueCodec<MyPersistedType>();
 *
 * // Later, in some other file...
 * interface SomeInMemoryType extends MyPersistedType {
 *     someOtherProperty: string;
 * }
 *
 * const someInMemoryObject: SomeInMemoryType = {
 *     foo:	"bar",
 *     id: 0,
 *     someOtherProperty: "this shouldn't be here and ends up in the persisted format"
 * }
 *
 * const encoded = codec.encode(someInMemoryObject);
 * ```
 * This all typechecks and passes at runtime, but the persisted format will contain the extraneous
 * `someOtherProperty` field.
 * It's unlikely a real-life example would be this simple, but the principle is the same.
 *
 * This issue can be avoided by using JSON schema that doesn't accept additional properties:
 *
 * ```typescript
 * const MyPersistedType = Type.Object({
 *     foo: Type.String(),
 *     id: Type.Number()
 * }, {
 *     additionalProperties: false
 * });
 * ```
 */
export function makeValueCodec<Schema extends TSchema>(
	schema: Schema,
	validator?: JsonValidator,
): IJsonCodec<Static<Schema>> {
	return withSchemaValidation(
		schema,
		{
			encode: (x: Static<Schema>) => x as unknown as JsonCompatibleReadOnly,
			decode: (x: JsonCompatibleReadOnly) => x as unknown as Static<Schema>,
		},
		validator,
	);
}

/**
 * Wraps a codec with JSON schema validation for its encoded type.
 * @returns An {@link IJsonCodec} which validates the data it encodes and decodes matches the provided schema.
 */
export function withSchemaValidation<
	TInMemoryFormat,
	EncodedSchema extends TSchema,
	TEncodedFormat = JsonCompatibleReadOnly,
	TValidate = TEncodedFormat,
>(
	schema: EncodedSchema,
	codec: IJsonCodec<TInMemoryFormat, TEncodedFormat, TValidate>,
	validator?: JsonValidator,
): IJsonCodec<TInMemoryFormat, TEncodedFormat, TValidate> {
	if (!validator) {
		return codec;
	}
	const compiledFormat = validator.compile(schema);
	return {
		encode: (obj: TInMemoryFormat) => {
			const encoded = codec.encode(obj);
			if (!compiledFormat.check(encoded)) {
				fail("Encoded schema should validate");
			}
			return encoded;
		},
		decode: (encoded: TValidate) => {
			if (!compiledFormat.check(encoded)) {
				fail("Encoded schema should validate");
			}
			// TODO: would be nice to provide a more specific validate type to the inner codec than the outer one gets.
			return codec.decode(encoded);
		},
	};
}
