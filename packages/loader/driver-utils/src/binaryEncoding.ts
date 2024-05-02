/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { JsonableOrBinary, Jsonable } from "@fluidframework/core-interfaces/internal";
import { Uint8ArrayToString, stringToBuffer } from "@fluid-internal/client-utils";

const binaryType = "__fluid_binary__";

/**
 * Encodes JsonableOrBinary into a string
 * @param content - content to stringify
 * @returns string
 * @internal
 */
export function encodeJsonableOrBinary<T>(content: JsonableOrBinary<T>): string {
	return JSON.stringify(content, (_key: string, value: JsonableOrBinary<T>) => {
		if (value instanceof ArrayBuffer) {
			return {
				type: binaryType,
				content: Uint8ArrayToString(new Uint8Array(value), "base64"),
			};
		}
		// eslint-disable-next-line @typescript-eslint/no-unsafe-return
		return value;
	});
}

/**
 * Decodes string back to JsonableOrBinary
 * @param content - an encoded string
 * @returns decoded JS object
 * @internal
 */
export function decodeJsonableOrBinary(content: string): JsonableOrBinary {
	return JSON.parse(content, (_key: string, value: Jsonable) => {
		if (value !== null && (value as any).type === binaryType) {
			return stringToBuffer((value as any).content, "base64");
		}
		return value;
	}) as JsonableOrBinary;
}
