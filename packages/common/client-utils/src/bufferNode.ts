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
	 * Static constructor
	 *
	 * @param value - `string`.
	 * @param encoding - `IsoBufferEncoding`.
	 *
	 * @privateRemarks
	 * Node buffer.buffer.d.ts declaration:
	 * `from(string: WithImplicitCoercion<string>, encoding?: IsoBufferEncoding): Buffer<ArrayBuffer>;`
	 */
	public static from(value: string, encoding?: IsoBufferEncoding): IsoBuffer<ArrayBuffer>;
	/**
	 * Static constructor
	 *
	 * @param value - `Uint8Array`.
	 *
	 * @remarks
	 * Is handled as a special case of `ArrayLike<number>` that is compatible with Browser implementation.
	 *
	 * @privateRemarks
	 * Node buffer.buffer.d.ts declaration:
	 * `from(array: WithImplicitCoercion<ArrayLike<number>>): IsoBuffer<ArrayBuffer>;`
	 * This is required for class to compile. Otherwise static property of from is incompatible.
	 */
	public static from(value: Uint8Array): IsoBuffer<ArrayBuffer>;
	/**
	 * Static constructor
	 *
	 * @param value - `ArrayBufferLike`.
	 * @param byteOffset - `number`.
	 * @param length - `number`.
	 *
	 * @privateRemarks
	 * Node buffer.buffer.d.ts declaration:
	 * ```
	 * public static from<TFArrayBuffer extends WithImplicitCoercion<ArrayBufferLike>>(
	 * 		arrayBuffer: TFArrayBuffer,
	 * 		byteOffset?: number,
	 * 		length?: number,
	 * ): Buffer<ImplicitArrayBuffer<TFArrayBuffer>>;
	 * ```
	 */
	public static from<TFArrayBuffer extends ArrayBufferLike>(
		value: TFArrayBuffer,
		byteOffset?: number,
		length?: number,
	): IsoBuffer<TFArrayBuffer>;

	public static isBuffer(obj: unknown): obj is Buffer;
}
Buffer satisfies IsoBufferConstructor;

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
