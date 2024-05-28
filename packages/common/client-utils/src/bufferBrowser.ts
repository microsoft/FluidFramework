/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as base64js from "base64-js";

/**
 * Converts a Uint8Array to a string of the provided encoding
 * Useful when the array might be an {@link IsoBuffer}.
 *
 * @param arr - The array to convert.
 * @param encoding - Optional target encoding; only "utf8" and "base64" are
 * supported, with "utf8" being default.
 * @returns The converted string.
 *
 * @internal
 */
export function Uint8ArrayToString(
	arr: Uint8Array,
	// eslint-disable-next-line unicorn/text-encoding-identifier-case -- this value is supported, just discouraged
	encoding?: "utf8" | "utf-8" | "base64",
): string {
	switch (encoding) {
		case "base64": {
			return base64js.fromByteArray(arr);
		}
		case "utf8":
		// eslint-disable-next-line unicorn/text-encoding-identifier-case -- this value is supported, just discouraged
		case "utf-8":
		case undefined: {
			return new TextDecoder().decode(arr);
		}
		default: {
			throw new Error("invalid/unsupported encoding");
		}
	}
}

/**
 * Converts a {@link https://en.wikipedia.org/wiki/Base64 | base64} or
 * {@link https://en.wikipedia.org/wiki/UTF-8 | utf-8} string to array buffer.
 *
 * @param encoding - The input string's encoding.
 *
 * @internal
 */
export const stringToBuffer = (input: string, encoding: string): ArrayBufferLike =>
	IsoBuffer.from(input, encoding).buffer;

/**
 * Convert binary blob to string format
 *
 * @param blob - the binary blob
 * @param encoding - output string's encoding
 * @returns the blob in string format
 *
 * @alpha
 */
export const bufferToString = (
	blob: ArrayBufferLike,
	// eslint-disable-next-line unicorn/text-encoding-identifier-case -- this value is supported, just discouraged
	encoding: "utf8" | "utf-8" | "base64",
): string => IsoBuffer.from(blob).toString(encoding);

/**
 * Determines if an object is an array buffer.
 *
 * @remarks Will detect and reject TypedArrays, like Uint8Array.
 * Reason - they can be viewport into Array, they can be accepted, but caller has to deal with
 * math properly (i.e. Take into account byteOffset at minimum).
 * For example, construction of new TypedArray can be in the form of new TypedArray(typedArray) or
 * new TypedArray(buffer, byteOffset, length), but passing TypedArray will result in fist path (and
 * ignoring byteOffice, length).
 *
 * @param obj - The object to determine if it is an ArrayBuffer.
 *
 * @internal
 */
export function isArrayBuffer(obj: unknown): obj is ArrayBuffer {
	const maybe = obj as (Partial<ArrayBuffer> & Partial<Uint8Array>) | undefined;
	return (
		obj instanceof ArrayBuffer ||
		(typeof maybe === "object" &&
			maybe !== null &&
			typeof maybe.byteLength === "number" &&
			typeof maybe.slice === "function" &&
			maybe.byteOffset === undefined &&
			maybe.buffer === undefined)
	);
}

/**
 * Minimal implementation of Buffer for our usages in the browser environment.
 *
 * @internal
 */
export class IsoBuffer extends Uint8Array {
	/**
	 * Convert the buffer to a string.
	 * Only supports encoding the whole string (unlike the Node Buffer equivalent)
	 * and only utf8 and base64 encodings.
	 *
	 * @param encoding - The encoding to use.
	 */
	// eslint-disable-next-line unicorn/text-encoding-identifier-case -- this value is supported, just discouraged
	public toString(encoding?: "utf8" | "utf-8" | "base64"): string {
		return Uint8ArrayToString(this, encoding);
	}

	/**
	 * Static constructor
	 * @param value - (string | ArrayBuffer)
	 * @param encodingOrOffset - (string | number)
	 * @param length - (number)
	 *
	 * @privateRemarks TODO: Use actual types
	 */
	// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types, @typescript-eslint/no-explicit-any
	static from(value: any, encodingOrOffset?: any, length?: any): IsoBuffer {
		if (typeof value === "string") {
			return IsoBuffer.fromString(value, encodingOrOffset as string | undefined);
			// Capture any typed arrays, including Uint8Array (and thus - IsoBuffer!)
			// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
		} else if (value !== null && typeof value === "object" && isArrayBuffer(value.buffer)) {
			// The version of the from function for the node buffer, which takes a buffer or typed array
			// as first parameter, does not have any offset or length parameters. Those are just silently
			// ignored and not taken into account
			// eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
			return IsoBuffer.fromArrayBuffer(value.buffer, value.byteOffset, value.byteLength);
		} else if (isArrayBuffer(value)) {
			return IsoBuffer.fromArrayBuffer(
				value,
				encodingOrOffset as number | undefined,
				length as number,
			);
		} else {
			throw new TypeError("Input value was neither a string nor an ArrayBuffer.");
		}
	}

	static fromArrayBuffer(
		arrayBuffer: ArrayBuffer,
		byteOffset?: number,
		byteLength?: number,
	): IsoBuffer {
		const offset = byteOffset ?? 0;
		const validLength = byteLength ?? arrayBuffer.byteLength - offset;
		if (
			offset < 0 ||
			offset > arrayBuffer.byteLength ||
			validLength < 0 ||
			validLength + offset > arrayBuffer.byteLength
		) {
			throw new RangeError("Invalid range specified.");
		}

		return new IsoBuffer(arrayBuffer, offset, validLength);
	}

	static fromString(str: string, encoding?: string): IsoBuffer {
		switch (encoding) {
			case "base64": {
				const sanitizedString = this.sanitizeBase64(str);
				const encoded = base64js.toByteArray(sanitizedString);
				return new IsoBuffer(encoded.buffer);
			}
			case "utf8":
			// eslint-disable-next-line unicorn/text-encoding-identifier-case -- this value is supported, just discouraged
			case "utf-8":
			case undefined: {
				const encoded = new TextEncoder().encode(str);
				return new IsoBuffer(encoded.buffer);
			}
			default: {
				throw new Error("invalid/unsupported encoding");
			}
		}
	}

	static isBuffer(obj: unknown): boolean {
		throw new Error("unimplemented");
	}

	/**
	 * Sanitize a base64 string to provide to base64-js library.
	 * {@link https://www.npmjs.com/package/base64-js} is not as tolerant of the same malformed base64 as Node'
	 * Buffer is.
	 */
	private static sanitizeBase64(str: string): string {
		let sanitizedStr = str;
		// Remove everything after padding - Node buffer ignores everything
		// after any padding whereas base64-js does not
		sanitizedStr = sanitizedStr.split("=")[0];

		// Remove invalid characters - Node buffer strips invalid characters
		// whereas base64-js replaces them with "A"
		sanitizedStr = sanitizedStr.replace(/[^\w+-/]/g, "");

		// Check for missing padding - Node buffer tolerates missing padding
		// whereas base64-js does not
		if (sanitizedStr.length % 4 !== 0) {
			const paddingArray = ["", "===", "==", "="];
			sanitizedStr += paddingArray[sanitizedStr.length % 4];
		}
		return sanitizedStr;
	}
}
