/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { compress, decompress } from "lz4js";
import { bufferToString, stringToBuffer } from "@fluidframework/common-utils";
import { Jsonable } from "@fluidframework/datastore-definitions";
import { Encoder } from "./encoders";

/**
 * @alpha
 */
export function makeLZ4Encoder<T>(): Encoder<Jsonable<T>, string> {
	return {
		encode: (decoded: Jsonable<T>) => {
			const uncompressed = new TextEncoder().encode(JSON.stringify(decoded));
			const compressed = compress(uncompressed);
			return bufferToString(compressed, "base64");
		},
		decode: (serializedSummary: string): Jsonable<T> => {
			const compressed = new Uint8Array(stringToBuffer(serializedSummary, "base64"));
			const uncompressed = decompress(compressed);
			const decoded: Jsonable<T> = JSON.parse(new TextDecoder().decode(uncompressed));
			return decoded;
		},
	};
}
