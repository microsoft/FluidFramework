/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

/**
 * Buffer class, used to sequentially read data.
 * Used by tree code to reconstruct a tree from binary representation.
 */
export class ReadBuffer {
	protected index = 0;

	public get buffer(): Uint8Array {
		return this.data;
	}

	constructor(protected readonly data: Uint8Array) {
		// BlobShallowCopy will return to users parts of this array.
		// We need to ensure that nobody can change it, as it will have
		// catastrophic result and will be really hard to investigate.
		Object.freeze(data.buffer);
	}

	public get eof(): boolean {
		return this.index === this.data.length;
	}
	public get pos(): number {
		return this.index;
	}
	public get length(): number {
		return this.data.length;
	}

	public slice(start: number, end: number): Uint8Array {
		return this.data.slice(start, end);
	}

	public reset(): void {
		this.index = 0;
	}

	public read(lengthArg = 1): number {
		let res = 0;
		let multiplier = 1;
		let length = lengthArg;
		while (length > 0) {
			assert(!this.eof, 0x223 /* "unexpected end of buffer" */);
			res += this.data[this.index] * multiplier;
			this.index++;
			multiplier *= 256;
			length--;
		}
		return res;
	}

	public skip(length: number): void {
		assert(length >= 0, 0x224 /* "Skip length should be positive" */);
		this.index += length;
		assert(this.index <= this.data.length, 0x3dc /* skipping past size of buffer */);
	}
}
