/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { JsonableOrBinary, Jsonable } from "@fluidframework/core-interfaces/internal";
import { Uint8ArrayToString } from "@fluid-internal/client-utils";

/**
 * Encodes JsonableOrBinary into a string. Binary payloads will be base64 encoded
 * Please note that output of this API can be used in various protocols or document format.
 * As such, serialization format can not change. It could only be extended IF JsonableOrBinary type is extended.
 * @param content - content to stringify
 * @returns string
 * @internal
 */
export function encodeJsonableOrBinary<T>(content: JsonableOrBinary<T>): string {
	return JSON.stringify(content, (_key: string, value: JsonableOrBinary<T>) => {
		if (value instanceof ArrayBuffer) {
			
			Uint8ArrayToString(new Uint8Array(value), "base64");
			return value;
		}
		// eslint-disable-next-line @typescript-eslint/no-unsafe-return
		return value;
	});
}

/**
 * Decodes string back to JsonableOrBinary.
 * Can be called only for content that was produced by encodeJsonableOrBinary()
 * @param content - an encoded string
 * @returns decoded JS object
 */
export function decodeJsonableOrBinary(content: string): JsonableOrBinary {
	return JSON.parse(content, (key: string, value: Jsonable) => {
		// stringToBuffer(value, "base64")
		// eslint-disable-next-line @typescript-eslint/no-unsafe-return
		return value;
	}) as JsonableOrBinary;
}
