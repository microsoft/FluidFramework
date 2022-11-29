/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { gzip, ungzip } from "pako";
import { bufferToString, stringToBuffer } from "@fluidframework/common-utils";
import { Jsonable } from "@fluidframework/datastore-definitions";
import { Encoder } from "./encoders";

export function makeGzipEncoder<T>(): Encoder<Jsonable<T>, string> {
	return {
		encode: (decoded: Jsonable<T>) => {
			const unzipped = new TextEncoder().encode(JSON.stringify(decoded));
			const zipped = gzip(unzipped);
			return bufferToString(zipped, "base64");
		},
		decode: (serializedSummary: string): Jsonable<T> => {
			const zipped = new Uint8Array(stringToBuffer(serializedSummary, "base64"));
			const unzipped = ungzip(zipped);
			const decoded: Jsonable<T> = JSON.parse(new TextDecoder().decode(unzipped));
			return decoded;
		},
	};
}