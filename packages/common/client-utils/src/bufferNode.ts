/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IsoBufferConstructor,
	IsoBufferEncoding,
	IsoBuffer as IsoBufferInterface,
} from "./buffer.js";

export type { IsoBufferConstructor, IsoBufferEncoding } from "./buffer.js";
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
 * Declare the subset of Buffer functionality we want to make available instead of
 * exposing the entirely of Node's typings.  This should match the public interface
 * of the browser implementation -- see {@link (IsoBuffer:type)} and {@link IsoBufferConstructor}.
 *
 * @internal
 */
export declare class Buffer<TArrayBuffer extends ArrayBufferLike = ArrayBufferLike>
	extends Uint8Array<TArrayBuffer>
	implements IsoBuffer<TArrayBuffer>
{
	/**
	 * Creates a new `IsoBuffer` containing `string`. The `encoding` parameter identifies
	 * the character encoding to be used when converting `string` into bytes.
	 *
	 * @param string - A string to encode.
	 * @param encoding - The encoding of `string`. **Default:** `'utf8'`.
	 *
	 * @privateRemarks
	 * Node buffer.buffer.d.ts declaration:
	 * `from(string: WithImplicitCoercion<string>, encoding?: IsoBufferEncoding): Buffer<ArrayBuffer>;`
	 */
	public static from(string: string, encoding?: IsoBufferEncoding): IsoBuffer<ArrayBuffer>;
	/**
	 * Allocates a new `IsoBuffer` using an `array` of bytes in the range `0` – `255`.
	 * Array entries outside that range will be truncated to fit into it.
	 *
	 * @param value - `Uint8Array`.
	 *
	 * @remarks
	 * This is limited to `Uint8Array` input to match Node implementation that
	 * takes `ArrayLike<number>` and returns `IsoBuffer<ArrayBuffer>`.
	 *
	 * @privateRemarks
	 * Node buffer.buffer.d.ts declaration:
	 * `from(array: WithImplicitCoercion<ArrayLike<number>>): IsoBuffer<ArrayBuffer>;`
	 */
	public static from(array: Uint8Array): IsoBuffer<ArrayBuffer>;
	/**
	 * This creates a view of the `ArrayBuffer` without copying the underlying
	 * memory. For example, when passed a reference to the `.buffer` property of a
	 * `TypedArray` instance, the newly created `Buffer` will share the same
	 * allocated memory as the `TypedArray`'s underlying `ArrayBuffer`.
	 *
	 * @param arrayBuffer - An `ArrayBuffer`, `SharedArrayBuffer`, for example the
	 * `.buffer` property of a `TypedArray`.
	 * @param byteOffset - Index of first byte to expose. **Default:** `0`.
	 * @param length - Number of bytes to expose. **Default:**
	 * `arrayBuffer.byteLength - byteOffset`.
	 *
	 * @privateRemarks
	 * Node buffer.buffer.d.ts declaration:
	 * ```
	 * public static from<TArrayBuffer extends WithImplicitCoercion<ArrayBufferLike>>(
	 * 		arrayBuffer: TArrayBuffer,
	 * 		byteOffset?: number,
	 * 		length?: number,
	 * ): Buffer<ImplicitArrayBuffer<TArrayBuffer>>;
	 * ```
	 */
	public static from<TArrayBuffer extends ArrayBufferLike>(
		arrayBuffer: TArrayBuffer,
		byteOffset?: number,
		length?: number,
	): IsoBuffer<TArrayBuffer>;

	public static isBuffer(obj: unknown): obj is Buffer;
}

/**
 * The native Node.js Buffer implementation.
 *
 * @internal
 */
export const IsoBuffer: IsoBufferConstructor = Buffer;

/**
 * Converts a `Uint8Array` to a string of the provided encoding.
 * @remarks Useful when the array might be an `IsoBuffer`.
 * @param arr - The array to convert.
 * @param encoding - Optional target encoding; only "utf8" and "base64" are
 * supported, with "utf8" being default.
 * @returns The converted string.
 *
 * @internal
 */
export function Uint8ArrayToString(arr: Uint8Array, encoding?: IsoBufferEncoding): string {
	// Buffer extends Uint8Array.  Therefore, 'arr' may already be a Buffer, in
	// which case we can avoid copying the Uint8Array into a new Buffer instance.
	return (IsoBuffer.isBuffer(arr) ? arr : IsoBuffer.from(arr)).toString(encoding);
}

/**
 * Convert base64 or utf8 string to array buffer.
 * @param encoding - The input string's encoding.
 *
 * @internal
 */
export function stringToBuffer(input: string, encoding: IsoBufferEncoding): ArrayBuffer {
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
 * @internal
 */
export const bufferToString = (
	blob: ArrayBufferLike | Uint8Array,
	encoding: IsoBufferEncoding,
): string =>
	Uint8ArrayToString(blob instanceof Uint8Array ? blob : IsoBuffer.from(blob), encoding);
