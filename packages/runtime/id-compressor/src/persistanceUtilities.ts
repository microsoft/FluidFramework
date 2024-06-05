/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { assert } from "@fluidframework/core-utils/internal";

import { NumericUuid } from "./identifiers.js";

const halfNumeric = BigInt("0xFFFFFFFFFFFFFFFF");
const sixtyFour = BigInt(64);

export function writeNumber(buffer: Float64Array, index: number, value: number): number {
	buffer[index] = value;
	return index + 1;
}

export function writeNumericUuid(
	buffer: BigUint64Array,
	index: number,
	value: NumericUuid,
): number {
	/* eslint-disable no-bitwise */
	buffer[index] = value & halfNumeric;
	buffer[index + 1] = value >> sixtyFour;
	/* eslint-enable no-bitwise */
	return index + 2; // UUID values are 16 bytes.
}

export function writeBoolean(buffer: Float64Array, index: number, value: boolean): number {
	return writeNumber(buffer, index, value ? 1 : 0);
}

/**
 * Helper type to allow returning a value when reading as well as incrementing an index to make
 * deserialization easier.
 * Should be constructed with two views of the same buffer and index set to 0.
 */
export interface Index {
	bufferFloat: Float64Array;
	bufferUint: BigUint64Array;
	index: number;
}

export function readNumber(index: Index): number {
	const value = index.bufferFloat[index.index];
	index.index += 1;
	assert(value !== undefined, "value is undefined in readNumber");

	return value;
}

export function readNumericUuid(index: Index): NumericUuid {
	const lowerHalf = index.bufferUint[index.index];
	const upperHalf = index.bufferUint[index.index + 1];
	assert(lowerHalf !== undefined, "lowerHalf is undefined in readNumericUuid");
	assert(upperHalf !== undefined, "upperHalf is undefined in readNumericUuid");
	/* eslint-disable no-bitwise */
	const value = (upperHalf << sixtyFour) | lowerHalf;
	/* eslint-enable no-bitwise */
	index.index += 2;
	return value as NumericUuid;
}

export function readBoolean(index: Index): boolean {
	return readNumber(index) === 1;
}
