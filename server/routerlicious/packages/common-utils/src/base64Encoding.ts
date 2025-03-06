/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IsoBuffer } from "./buffer";

/**
 * Converts the provided {@link https://en.wikipedia.org/wiki/Base64 | base64}-encoded string
 * to {@link https://en.wikipedia.org/wiki/UTF-8 | utf-8}.
 * @internal
 */
export const fromBase64ToUtf8 = (input: string): string =>
	IsoBuffer.from(input, "base64").toString("utf-8");

/**
 * Converts the provided {@link https://en.wikipedia.org/wiki/UTF-8 | utf-8}-encoded string
 * to {@link https://en.wikipedia.org/wiki/Base64 | base64}.
 * @internal
 */
export const fromUtf8ToBase64 = (input: string): string =>
	IsoBuffer.from(input, "utf8").toString("base64");

/**
 * Convenience function to convert unknown encoding to utf8 that avoids
 * buffer copies/encode ops when no conversion is needed.
 * @param input - The source string to convert.
 * @param encoding - The source string's encoding.
 * @internal
 */
export const toUtf8 = (input: string, encoding: string): string => {
	switch (encoding) {
		case "utf8":
		case "utf-8": {
			return input;
		}
		default: {
			return IsoBuffer.from(input, encoding).toString();
		}
	}
};
