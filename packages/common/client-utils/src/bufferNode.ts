/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Declare the subset of Buffer functionality we want to make available instead of
 * exposing the entirely of Node's typings.  This should match the public interface
 * of the browser implementation, so any changes made in one should be made in both.
 *
 * @internal
 */
export declare class Buffer extends Uint8Array {
	// eslint-disable-next-line unicorn/text-encoding-identifier-case -- this value is supported, just discouraged
	toString(encoding?: "utf8" | "utf-8" | "base64"): string;

	/**
	 * Static constructor
	 *
	 * @param value - (string | ArrayBuffer).
	 * @param encodingOrOffset - (string | number).
	 * @param length - (number).
	 *
	 * @privateRemarks TODO: Use actual types
	 */
	static from(value: unknown, encodingOrOffset?: unknown, length?: unknown): IsoBuffer;
	static isBuffer(obj: unknown): obj is Buffer;
}

/**
 * @internal
 */
export const IsoBuffer = Buffer;

/**
 * @internal
 */
export type IsoBuffer = Buffer;

/**
 * Converts a Uint8Array to a string of the provided encoding.
 * @remarks Useful when the array might be an IsoBuffer.
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
	// Buffer extends Uint8Array.  Therefore, 'arr' may already be a Buffer, in
	// which case we can avoid copying the Uint8Array into a new Buffer instance.
	return (Buffer.isBuffer(arr) ? arr : Buffer.from(arr)).toString(encoding);
}

/**
 * Convert base64 or utf8 string to array buffer.
 * @param encoding - The input string's encoding.
 *
 * @internal
 */
export function stringToBuffer(input: string, encoding: string): ArrayBufferLike {
	const iso = IsoBuffer.from(input, encoding);
	// In a Node environment, IsoBuffer may be a Node.js Buffer.  Node.js will
	// pool multiple small Buffer instances into a single ArrayBuffer, in which
	// case we need to slice the appropriate span of bytes.
	return iso.byteLength === iso.buffer.byteLength
		? iso.buffer
		: iso.buffer.slice(iso.byteOffset, iso.byteOffset + iso.byteLength);
}

/**
 * Convert binary blob to string format
 *
 * @param blob - The binary blob
 * @param encoding - Output string's encoding
 * @returns The blob in string format
 *
 * @alpha
 */
export const bufferToString = (
	blob: ArrayBufferLike,
	// eslint-disable-next-line unicorn/text-encoding-identifier-case -- this value is supported, just discouraged
	encoding: "utf8" | "utf-8" | "base64",
): string => IsoBuffer.from(blob).toString(encoding);
