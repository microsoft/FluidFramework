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
	 * Static constructor
	 *
	 * @param value - `string`.
	 * @param encoding - `IsoBufferEncoding`.
	 *
	 * @privateRemarks
	 * Node buffer.buffer.d.ts declaration:
	 * `from(string: WithImplicitCoercion<string>, encoding?: IsoBufferEncoding): Buffer<ArrayBuffer>;`
	 */
	from(value: string, encoding?: IsoBufferEncoding): IsoBuffer<ArrayBuffer>;
	/**
	 * Static constructor
	 *
	 * @param value - `Uint8Array`.
	 *
	 * @remarks
	 * This is limited to `ArrayBuffer` input to match Node implementation that takes `ArrayLike<number>` and returns `IsoBuffer<ArrayBuffer>`.
	 *
	 * @privateRemarks
	 * Node buffer.buffer.d.ts declaration:
	 * `from(array: WithImplicitCoercion<ArrayLike<number>>): IsoBuffer<ArrayBuffer>;`
	 */
	from(value: Uint8Array): IsoBuffer<ArrayBuffer>;
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
	from<TArrayBuffer extends ArrayBufferLike>(
		value: TArrayBuffer,
		byteOffset?: number,
		length?: number,
	): IsoBuffer<TArrayBuffer>;

	isBuffer(obj: unknown): obj is IsoBuffer<ArrayBufferLike>;
}
