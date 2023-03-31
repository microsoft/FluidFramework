/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { bufferToString, IsoBuffer } from "@fluidframework/common-utils";
import { JsonCompatibleReadOnly } from "../util";

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

export interface ICodecFamily<TDecoded, TJsonEncoded = JsonCompatibleReadOnly> {
	resolve(version: number): IMultiFormatCodec<TDecoded, TJsonEncoded>;
}

/**
 * Constructs a {@link IMultiFormatCodec} from a `IJsonCodec` using a generic binary encoding.
 */
export function withDefaultBinaryEncoding<TDecoded, TEncoded>(
	jsonCodec: IJsonCodec<TDecoded, TEncoded>,
): IMultiFormatCodec<TDecoded, TEncoded> {
	return {
		json: jsonCodec,
		binary: {
			encode: (change: TDecoded): IsoBuffer => {
				const jsonable = jsonCodec.encode(change);
				const json = JSON.stringify(jsonable);
				return IsoBuffer.from(json);
			},

			decode: (change: IsoBuffer): TDecoded => {
				const json = bufferToString(change, "utf8");
				const jsonable = JSON.parse(json);
				return jsonCodec.decode(jsonable);
			},
		},
	};
}
