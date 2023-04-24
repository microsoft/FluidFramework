/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, bufferToString, IsoBuffer } from "@fluidframework/common-utils";
import { fail, JsonCompatibleReadOnly } from "../util";

/**
 * @alpha
 */
export interface IEncoder<TDecoded, TEncoded> {
	/**
	 * Encodes `obj` into some encoded format. Typically paired with an {@link IDecoder}.
	 */
	encode(obj: TDecoded): TEncoded;
}

/**
 * @alpha
 */
export interface IDecoder<TDecoded, TEncoded> {
	/**
	 * Decodes `obj` from some encoded format. Typically paired with an {@link IEncoder}.
	 */
	decode(obj: TEncoded): TDecoded;
}

/**
 * @alpha
 */
export interface IJsonCodec<
	TDecoded,
	TEncoded extends JsonCompatibleReadOnly = JsonCompatibleReadOnly,
> extends IEncoder<TDecoded, TEncoded>,
		IDecoder<TDecoded, TEncoded> {}

/**
 * @remarks - TODO: We might consider using DataView or some kind of writer instead of IsoBuffer.
 * @alpha
 */
export interface IBinaryCodec<TDecoded>
	extends IEncoder<TDecoded, IsoBuffer>,
		IDecoder<TDecoded, IsoBuffer> {}

/**
 * Contains knowledge of how to encode some in-memory type into JSON and binary formats,
 * as well as how to decode those representations.
 *
 * @remarks - Codecs are typically used in shared-tree to convert data into some persisted format.
 * For this common use case, any format for encoding that was ever actually used needs to
 * be supported for decoding in all future code versions.
 *
 * Using an {@link ICodecFamily} is the recommended strategy for managing this support, keeping in
 * mind evolution of encodings over time.
 *
 * @alpha
 */
export interface IMultiFormatCodec<
	TDecoded,
	TJsonEncoded extends JsonCompatibleReadOnly = JsonCompatibleReadOnly,
> {
	json: IJsonCodec<TDecoded, TJsonEncoded>;
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
 * @alpha
 */
export interface ICodecFamily<TDecoded> {
	/**
	 * @returns - a codec that can be used to encode and decode data in the specified format.
	 * @throws - if the format version is not supported by this family.
	 * @remarks - Implementations should typically emit telemetry (either indirectly by throwing a well-known error with
	 * logged properties or directly using some logger) when a format version is requested that is not supported.
	 * This ensures that applications can diagnose compatibility issues.
	 */
	resolve(formatVersion: number): IMultiFormatCodec<TDecoded>;

	/**
	 * @returns - an iterable of all format versions supported by this family.
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
 * @remarks - Beware that this encoder doesn't validate its input and isn't typesafe.
 * It would be great to be able to constrain T to a reasonable type, but due to how typechecking
 * of index signatures works, JsonCompatibleReadOnly isn't sufficient.
 *
 * TODO: This API is an anti-pattern for production code: using the same type for persisted and in-memory data
 * without any validation is prone to bugs involving extraneous data in the persisted format.
 * Consider the following example:
 * ```typescript
 * interface MyPersistedType {
 *     foo: string;
 *     id: number;
 * }
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
 * This all typechecks, but the persisted format will contain the extraneous `someOtherProperty` field.
 * It's unlikely a real-life example would be this simple, but the principle is the same.
 *
 * This issue can be avoided using schema validation with schemas that generally shouldn't accept additional properties.
 *
 * AB#4074 tracks making this function take a typebox schema and using it to validate objects.
 * Note: this might allow usage of Jsonable, since the type parameter would be inferrable from the schema.
 */
export function makeValueCodec<T>(): IJsonCodec<T> {
	return {
		encode: (obj: T) => obj as unknown as JsonCompatibleReadOnly,
		decode: (obj: JsonCompatibleReadOnly) => obj as unknown as T,
	};
}
