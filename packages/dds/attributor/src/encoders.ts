/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { gzip, ungzip } from "pako";
import { assert, bufferToString, stringToBuffer } from "@fluidframework/common-utils";
import { Jsonable } from "@fluidframework/datastore-definitions";

export interface Encoder<TDecoded, TEncoded> {
	encode(decoded: TDecoded): TEncoded;

	decode(encoded: TEncoded): TDecoded;
}

export type TimestampEncoder = Encoder<number[], Jsonable>;

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

export const deltaEncoder: TimestampEncoder = {
	encode: (timestamps: number[]) => {
		const deltaTimestamps: number[] = new Array(timestamps.length);
		let prev = 0;
		for (let i = 0; i < timestamps.length; i++) {
			deltaTimestamps[i] = timestamps[i] - prev;
			prev = timestamps[i];
		}
		return deltaTimestamps;
	},
	decode: (encoded: Jsonable) => {
		assert(Array.isArray(encoded), "Encoded timestamps should be an array of nummbers");
		const timestamps: number[] = new Array(encoded.length);
		let cumulativeSum = 0;
		for (let i = 0; i < encoded.length; i++) {
			cumulativeSum += encoded[i];
			timestamps[i] = cumulativeSum;
		}
		return timestamps;
	},
};
