/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Declare the subset of node:Buffer functionality we want to make available instead of
 * exposing the entirely of Node's typings.  These serve as the public interface
 * of the browser and node implementation.
 */

/**
 * Set of supported encodings for string to buffer conversion.
 *
 * @internal
 */
export type IsoBufferEncoding =
	| "utf8"
	// eslint-disable-next-line unicorn/text-encoding-identifier-case -- "utf-8" value is supported, just discouraged
	| "utf-8"
	| "base64";

/**
 * Minimal Buffer interface for our usages in the browser or Node environments.
 *
 * @internal
 */
export interface IsoBuffer<TArrayBuffer extends ArrayBufferLike>
	extends Uint8Array<TArrayBuffer> {
	/**
	 * Convert the buffer to a string.
	 * Only supports encoding the whole string (unlike the Node `Buffer` equivalent)
	 * and only utf8 and base64 encodings.
	 *
	 * @param encoding - The encoding to use.
	 */
	toString(encoding?: IsoBufferEncoding): string;
}

/**
 * Constructor for {@link (IsoBuffer:type)}.
 *
 * @internal
 */
export interface IsoBufferConstructor {
	readonly prototype: IsoBuffer<ArrayBufferLike>;

	new (length: number): IsoBuffer<ArrayBuffer>;
	new (array: ArrayLike<number>): IsoBuffer<ArrayBuffer>;
	new <TArrayBuffer extends ArrayBufferLike = ArrayBuffer>(
		buffer: TArrayBuffer,
		byteOffset?: number,
		length?: number,
	): IsoBuffer<TArrayBuffer>;

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
	from(string: string, encoding?: IsoBufferEncoding): IsoBuffer<ArrayBuffer>;
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
	from(array: Uint8Array): IsoBuffer<ArrayBuffer>;
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
	from<TArrayBuffer extends ArrayBufferLike>(
		arrayBuffer: TArrayBuffer,
		byteOffset?: number,
		length?: number,
	): IsoBuffer<TArrayBuffer>;

	isBuffer(obj: unknown): obj is IsoBuffer<ArrayBufferLike>;
}
