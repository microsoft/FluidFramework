/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable no-bitwise */
import { NumericUuid } from "./identifiers";

const biguint64Buffer = new BigUint64Array(2);
const biguint64FloatView = new Float64Array(biguint64Buffer.buffer);
const halfNumeric = BigInt("0xFFFFFFFFFFFFFFFF");
const sixtyFour = BigInt(64);

export function writeNumber(arr: Float64Array, index: number, value: number): number {
	arr[index] = value;
	return index + 1;
}

export function writeNumericUuid(arr: Float64Array, index: number, value: NumericUuid): number {
	biguint64Buffer[0] = value & halfNumeric;
	biguint64Buffer[1] = value >> sixtyFour;
	arr.set(biguint64FloatView, index);
	return index + 2; // UUID values are 16 bytes.
}

export function writeBoolean(arr: Float64Array, index: number, value: boolean): number {
	return writeNumber(arr, index, value ? 1 : 0);
}

export interface Index {
	bytes: Float64Array;
	index: number;
}

export function readNumber(index: Index): number {
	const value = index.bytes[index.index];
	index.index += 1;
	return value;
}

export function readNumericUuid(index: Index): NumericUuid {
	biguint64FloatView.set(index.bytes.subarray(index.index, index.index + 2));
	const lowerHalf = biguint64Buffer[0];
	const upperHalf = biguint64Buffer[1];
	const value = (upperHalf << sixtyFour) | lowerHalf;
	index.index += 2;
	return value as NumericUuid;
}

export function readBoolean(index: Index): boolean {
	return readNumber(index) === 1;
}
