/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, bufferToString, IsoBuffer } from "@fluidframework/common-utils";
import { fail, JsonCompatibleReadOnly } from "../util";

export interface IEncoder<TDecoded, TEncoded> {
	/**
	 * Encodes `obj` into some encoded format.
	 */
	encode(obj: TDecoded): TEncoded;
}

export interface IDecoder<TDecoded, TEncoded> {
	/**
	 * Decodes `obj` from some encoded format. Typically paired with an {@link IEncoder}.
	 */
	decode(obj: TEncoded): TDecoded;
}

export interface IJsonCodec<TDecoded, TEncoded = JsonCompatibleReadOnly>
	extends IEncoder<TDecoded, TEncoded>,
		IDecoder<TDecoded, TEncoded> {}

// TODO: maybe use DataView or some kind of writer instead of IsoBuffer.
export interface IBinaryCodec<TDecoded>
	extends IEncoder<TDecoded, IsoBuffer>,
		IDecoder<TDecoded, IsoBuffer> {}

export interface ICodecFamily<TDecoded> {
	resolve(formatVersion: number): IMultiFormatCodec<TDecoded>;

	getSupportedFormats(): Iterable<number>;
}

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
 */
export interface IMultiFormatCodec<TDecoded, TJsonEncoded = JsonCompatibleReadOnly> {
	json: IJsonCodec<TDecoded, TJsonEncoded>;
	binary: IBinaryCodec<TDecoded>;
}

export function makeCodecFamily<TDecoded>(
	registry: Iterable<
		[formatVersion: number, codec: IMultiFormatCodec<TDecoded> | IJsonCodec<TDecoded>]
	>,
): ICodecFamily<TDecoded> {
	const isJsonCodec = (
		codec: IMultiFormatCodec<TDecoded> | IJsonCodec<TDecoded>,
	): codec is IJsonCodec<TDecoded> =>
		typeof (codec as any).encode === "function" && typeof (codec as any).decode === "function";
	const codecs: Map<number, IMultiFormatCodec<TDecoded>> = new Map();
	for (const [formatVersion, codec] of registry) {
		if (codecs.get(formatVersion) !== undefined) {
			fail("Duplicate codecs specified.");
		}
		if (isJsonCodec(codec)) {
			codecs.set(formatVersion, withDefaultBinaryEncoding(codec));
		} else {
			codecs.set(formatVersion, codec);
		}
	}

	return {
		resolve(formatVersion: number) {
			const codec = codecs.get(formatVersion);
			assert(codec !== undefined, "Requested coded for unsupported format.");
			return codec;
		},
		getSupportedFormats() {
			return codecs.keys();
		},
	};
}

class DefaultBinaryCodec<TDecoded> implements IBinaryCodec<TDecoded> {
	public constructor(private jsonCodec: IJsonCodec<TDecoded>) {}

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

/**
 * Constructs a {@link IMultiFormatCodec} from a `IJsonCodec` using a generic binary encoding.
 */
export function withDefaultBinaryEncoding<TDecoded>(
	jsonCodec: IJsonCodec<TDecoded>,
): IMultiFormatCodec<TDecoded> {
	return {
		json: jsonCodec,
		binary: new DefaultBinaryCodec(jsonCodec),
	};
}
