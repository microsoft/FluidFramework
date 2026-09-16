/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as base64js from "base64-js";

import type {
	IsoBufferConstructor,
	IsoBufferEncoding,
	IsoBuffer as IsoBufferInterface,
} from "./buffer.js";

export type {
	IsoBufferConstructor,
	IsoBufferEncoding,
} from "./buffer.js";
/**
 * Minimal `Buffer` interface for our usages in the browser or Node.js environments.
 *
 * @internal
 *
 * @privateRemarks
 * This type is exported specifically from here to respect combo type+value of same name rules.
 */
export type IsoBuffer<TArrayBuffer extends ArrayBufferLike = ArrayBufferLike> =
	IsoBufferInterface<TArrayBuffer>;

/**
 * Converts a `Uint8Array` to a string of the provided encoding
 * Useful when the array might be an {@link (IsoBuffer:type)}.
 *
 * @param arr - The array to convert.
 * @param encoding - Optional target encoding; only "utf8" and "base64" are
 * supported, with "utf8" being default.
 * @returns The converted string.
 *
 * @internal
 */
export function Uint8ArrayToString(arr: Uint8Array, encoding?: IsoBufferEncoding): string {
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
export const stringToBuffer = (input: string, encoding: IsoBufferEncoding): ArrayBuffer =>
	IsoBuffer.from(input, encoding).buffer;

/**
 * Convert binary blob to string format
 *
 * @param blob - the binary blob
 * @param encoding - output string's encoding
 * @returns the blob in string format
 *
 * @internal
 */
export const bufferToString = (
	blob: ArrayBufferLike | Uint8Array,
	encoding: IsoBufferEncoding,
): string =>
	Uint8ArrayToString(blob instanceof Uint8Array ? blob : IsoBuffer.from(blob), encoding);

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
 * @param obj - The object to determine if it is `ArrayBufferLike`.
 *
 * @privateRemarks
 * This function preserves runtime functionality as it has been in the past.
 * Typing has been adjusted to reflect the only use that remains and (assuming
 * is called as expected) will always return true as the input is already
 * expected to be `ArrayBufferLike`.
 */
function isArrayBufferLike(obj: ArrayBufferLike): obj is ArrayBufferLike {
	const maybe = obj as (Partial<ArrayBufferLike> & Partial<Uint8Array>) | undefined;
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
 * Minimal implementation of `Buffer` for our usages in the browser environment.
 *
 * @internal
 */
// eslint-disable-next-line @typescript-eslint/no-shadow -- Preserve the public constructor name at runtime.
export const IsoBuffer: IsoBufferConstructor = class IsoBuffer<
		TArrayBuffer extends ArrayBufferLike = ArrayBufferLike,
	>
	extends Uint8Array<TArrayBuffer>
	implements IsoBufferInterface<TArrayBuffer>
{
	public constructor(
		value: number | ArrayLike<number> | TArrayBuffer,
		byteOffset?: number,
		length?: number,
	) {
		super(value as TArrayBuffer, byteOffset, length);
	}

	public toString(encoding?: IsoBufferEncoding): string {
		return Uint8ArrayToString(this, encoding);
	}

	public static from(
		value: string,
		encoding?: IsoBufferEncoding,
	): IsoBufferInterface<ArrayBuffer>;
	public static from(value: Uint8Array): IsoBufferInterface<ArrayBuffer>;
	public static from<TFArrayBuffer extends ArrayBufferLike>(
		value: TFArrayBuffer,
		byteOffset?: number,
		length?: number,
	): IsoBufferInterface<TFArrayBuffer>;
	public static from<TFArrayBuffer extends ArrayBufferLike>(
		value: string | Uint8Array | TFArrayBuffer,
		encodingOrOffset?: IsoBufferEncoding | number,
		length?: number,
	): IsoBufferInterface<ArrayBufferLike> {
		if (typeof value === "string") {
			return IsoBuffer.fromString(
				value,
				encodingOrOffset as IsoBufferEncoding | undefined,
			) satisfies IsoBufferInterface<ArrayBuffer>;
			// Capture any typed arrays, including Uint8Array (and thus - IsoBuffer!)
		} else if (value instanceof Uint8Array) {
			// The version of the from function for the node buffer, which takes a buffer or typed array
			// as first parameter, does not have any offset or length parameters. Those are just silently
			// ignored and not taken into account
			const copy = new Uint8Array(value.byteLength);
			copy.set(value);
			return new IsoBuffer<ArrayBuffer>(copy.buffer) satisfies IsoBufferInterface<ArrayBuffer>;
		} else if (isArrayBufferLike(value)) {
			return IsoBuffer.fromArrayBuffer(value, encodingOrOffset as number | undefined, length);
		} else {
			throw new TypeError(
				"Input value was neither a string, a Uint8Array, nor an ArrayBuffer.",
			);
		}
	}

	public static fromArrayBuffer<TFArrayBuffer extends ArrayBufferLike>(
		arrayBuffer: TFArrayBuffer,
		byteOffset?: number,
		byteLength?: number,
	): IsoBufferInterface<TFArrayBuffer> {
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

		return new IsoBuffer<TFArrayBuffer>(arrayBuffer, offset, validLength);
	}

	public static fromString(
		str: string,
		encoding?: IsoBufferEncoding,
	): IsoBufferInterface<ArrayBuffer> {
		switch (encoding) {
			case "base64": {
				const sanitizedString = this.sanitizeBase64(str);
				// base64-js will always return a Uint8Array<ArrayBuffer>, but typing has not
				// been updated to reflect that yet.  Cast to the correct type here.
				const encoded = base64js.toByteArray(sanitizedString) as Uint8Array<ArrayBuffer>;
				return new IsoBuffer(encoded.buffer, encoded.byteOffset, encoded.byteLength);
			}
			case "utf8":
			// eslint-disable-next-line unicorn/text-encoding-identifier-case -- this value is supported, just discouraged
			case "utf-8":
			case undefined: {
				const encoded = new TextEncoder().encode(str);
				return new IsoBuffer(encoded.buffer, encoded.byteOffset, encoded.byteLength);
			}
			default: {
				throw new Error("invalid/unsupported encoding");
			}
		}
	}

	public static isBuffer(obj: unknown): obj is IsoBuffer {
		return obj instanceof IsoBuffer;
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
} satisfies IsoBufferConstructor;
