/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable no-bitwise */

/**
 * @fileoverview Utility functions related to handling GUIDs
 */

import base64js from "base64-js";

import { generateRandomUInt32Array } from "../platform-dependent";
const UINT_32HASH_PRIME = 16777619;

/**
 * Fast high quality 32 bit RNG for consistent GUID.
 *
 * Good "randomness" (distribution); Period is approximately equal to  3.11*10^37
 * Implementation was take from "Numerical recipes. The Art of Scientific Computing.", 3rd edition.
 * Page 357, algorithm name: Ranlim32
 */
const guidRNG = {
	u: 0,
	v: 0,
	w1: 0,
	w2: 0,
	isInitialized: false,

	/**
	 * Initialize RNG.
	 * This function need to be called once, before the first GUID gets created.
	 *
	 * @param in_seed - Optional 32-bit seed for GUID RNG.
	 * If no seed is given, a combination of system's local time and `Math.random()` is used.
	 * @param in_enforceReInitialization - Optionally enforce re-initialization with another seed.
	 *
	 * @returns The seed used to initialize the RNG;
	 * If re-initialization is not enforced, a zero indicates that the RNG was not re-seeded.
	 *
	 * @alias property-common.initializeGUIDGenerator
	 */
	initialize(in_seed?: number, in_enforceReInitialization: boolean = false): number {
		// Quit if the RNG has already been initialized and we do not
		// want to enforce a re-initialization with a new seed
		if (this.isInitialized && !in_enforceReInitialization) {
			return 0;
		} else {
			this.isInitialized = true;

			if (in_seed === undefined) {
				const randomValues = generateRandomUInt32Array(4);
				this.u = randomValues[0];
				this.v = randomValues[1];
				this.w1 = randomValues[2];
				this.w2 = randomValues[3];
			} else {
				this.v = 224461437;
				this.w1 = 521288629;
				this.w2 = 362436069;

				this.u = in_seed ^ this.v;
				this.genRandUInt32();
				this.v = this.u;
				this.genRandUInt32();
			}
			return -1;
		}
	},

	/**
	 * @returns 32-bit random number based on the RNGs internal state
	 */
	genRandUInt32(): number {
		this.u = multiply_uint32(this.u, 2891336453) + 1640531513;
		this.v ^= this.v >>> 13;
		this.v ^= this.v << 17;
		this.v = ((this.v >>> 5) ^ this.v) >>> 0;

		this.w1 = multiply_uint32(33378, this.w1 & 0xffff) + (this.w1 >>> 16);
		this.w2 = multiply_uint32(57225, this.w2 & 0xffff) + (this.w2 >>> 16);

		let x = this.u ^ (this.u << 9);
		x ^= x >>> 17;
		x ^= x << 6;

		let y = this.w1 ^ (this.w1 << 17);
		y ^= y >>> 15;
		y ^= y << 5;
		return (((x >>> 0) + this.v) ^ ((y >>> 0) + this.w2)) >>> 0;
	},
};

/**
 * Check if GUID is base64 based on the length
 * The length of base16 GUID is 36, base64 - 22
 *
 * @param GUID - Input GUID
 * @returns True if GUID is base64
 */
const isBase64 = (GUID: string): boolean => GUID.length === 22;

/**
 * Allows for 32-bit integer multiplication with C-like semantics
 *
 * @param a - unsigned int32 value
 * @param b - unsigned int32 value
 * @returns The result of the unsigned integer multiplication.
 */
function multiply_uint32(a: number, b: number): number {
	let n = a;
	let m = b;

	n >>>= 0;
	m >>>= 0;
	const nlo = n & 0xffff;
	return ((((n - nlo) * m) >>> 0) + nlo * m) >>> 0;
}

/**
 * Helper function to convert base64 encoding to url friendly format
 *
 * @param base64 - Base64 string
 *
 * @returns Url-friendly base64 encoding.
 */
const toUrlBase64 = (base64: string): string =>
	base64.replace(/\+/g, "-").replace(/\//g, "_").split("=")[0];

/**
 * Helper function to recover padding of base64 encoding
 *
 * @param x - Base64 string
 *
 * @returns Padded base64 encoding.
 */
const toPaddedBase64 = function (x: string): string {
	let base64 = x;
	const padLength = 4 - (base64.length % 4);
	base64 += "=".repeat(padLength);
	return base64;
};

/**
 * Helper function to create a GUID string from an array with 32Bit values
 *
 * @param in_guidArray - Array with the 32 bit values
 * @param base64 - Use base64 encoding instead of standart guids
 *
 * @returns The GUID
 */
const uint32x4ToGUID = function (
	in_guidArray: Uint32Array | Int32Array | number[],
	base64: boolean = false,
): string {
	if (base64) {
		const intArray = new Uint32Array(in_guidArray);
		const byteArray = new Uint8Array(intArray.buffer);
		const base64guid = base64js.fromByteArray(byteArray);
		// return url-friendly base64
		return toUrlBase64(base64guid);
	} else {
		// Convert to hexadecimal string
		let str = "";
		for (let i = 0; i < 4; i++) {
			const hex = in_guidArray[i].toString(16);
			str += "0".repeat(8 - hex.length) + hex;
		}
		return `${str.substr(0, 8)}-${str.substr(8, 4)}-${str.substr(12, 4)}-${str.substr(
			16,
			4,
		)}-${str.substr(20, 12)}`;
	}
};

/**
 * Convert GUID to four 32Bit values.
 *
 * @param in_guid - The GUID to convert
 * @param io_result - An optional array to write the result to.
 * If no array is given, a new one gets created.
 * @returns Four 32-bit values
 *
 */
const guidToUint32x4 = function (
	in_guid: string,
	result: Uint32Array = new Uint32Array(4),
): Uint32Array {
	if (isBase64(in_guid)) {
		const GUID = toPaddedBase64(in_guid);
		const bytes = base64js.toByteArray(GUID);
		const intArray = new Uint32Array(bytes.buffer);
		result.set(intArray);
	} else {
		result[0] = parseInt(`0x${in_guid.substr(0, 8)}`, 16);
		result[1] = parseInt(`0x${in_guid.substr(9, 4)}${in_guid.substr(14, 4)}`, 16);
		result[2] = parseInt(`0x${in_guid.substr(19, 4)}${in_guid.substr(24, 4)}`, 16);
		result[3] = parseInt(`0x${in_guid.substr(28, 8)}`, 16);
	}
	return result;
};

/**
 * Convert base64 GUID into base16.
 *
 * @param in_guid - Base64 GUID to convert
 * @returns Base16 GUID
 *
 */
const base64Tobase16 = (in_guid: string) => uint32x4ToGUID(guidToUint32x4(in_guid));

/**
 * Convert base16 into base64 GUID.
 *
 * @param in_guid - Base16 GUID to convert
 * @returns Base64 GUID
 *
 */
const base16ToBase64 = (in_guid: string) => uint32x4ToGUID(guidToUint32x4(in_guid), true);

/**
 * Based on the boolean parameter generate either
 * a 128 bit base16 GUID with the following format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxx
 * or url-friendly base64 string GUID of length 22
 *
 * This function is *not* thread safe!
 *
 * @param base64 - Use base64 encoding instead of standart guids
 *
 * @returns The GUID
 */
const generateGUID = function (base64 = false): string {
	const rnds = new Uint32Array(4);

	// Random numbers for GUID (4x32 bit)
	rnds[0] = guidRNG.genRandUInt32();
	rnds[1] = guidRNG.genRandUInt32();
	rnds[2] = guidRNG.genRandUInt32();
	rnds[3] = guidRNG.genRandUInt32();
	return uint32x4ToGUID(rnds, base64);
};

// The last character is checked this way because last 4 bits of 22nd character are ignored
// by decoder, e.g. "+Q" and "+Z" result in the same decoding.
// The only characters with last 4 bits set to 0 are A, Q, g, w.
const reBase64 = /^[\w-]{21}[AQgw]$/;

const reBase16 = /^[\dA-Fa-f]{8}(?:-[\dA-Fa-f]{4}){3}-[\dA-Fa-f]{12}$/;

/**
 * Routine used to check whether the given string is a valid GUID
 *
 * @param in_guid - The GUID to test.
 * @returns True if the parameter is a valid GUID, false otherwise.
 */
const isGUID = (in_guid: string) => reBase16.test(in_guid) || reBase64.test(in_guid);

/**
 * Performs a hash combination operation on the two supplied Uint32 arrays of length 4 (using
 * a variant of the algorithm from boost::hash_combine
 *
 * @param in_array1 - First array
 * @param in_array2 - Second array
 * @returns New combined hash
 */
const hashCombine4xUint32 = function (
	in_array1: Uint32Array,
	in_array2: Uint32Array,
	io_result?: Uint32Array,
): Uint32Array {
	let accumulated = io_result;
	if (accumulated === undefined) {
		accumulated = new Uint32Array(in_array2);
	} else {
		accumulated[0] = in_array2[0];
		accumulated[1] = in_array2[1];
		accumulated[2] = in_array2[2];
		accumulated[3] = in_array2[3];
	}

	accumulated[0] += 0x9e3779b9;
	accumulated[1] += 0x638f227;
	accumulated[2] += 0x1aff2bad;
	accumulated[3] += 0x3a8f05c5;

	accumulated[0] += in_array1[3] << 6;
	accumulated[1] += in_array1[0] << 6;
	accumulated[2] += in_array1[1] << 6;
	accumulated[3] += in_array1[2] << 6;

	accumulated[0] += in_array1[2] >> 2;
	accumulated[1] += in_array1[3] >> 2;
	accumulated[2] += in_array1[0] >> 2;
	accumulated[3] += in_array1[1] >> 2;

	accumulated[0] = ((accumulated[0] ^ in_array1[1]) * UINT_32HASH_PRIME) >>> 0;
	accumulated[1] = ((accumulated[1] ^ in_array1[2]) * UINT_32HASH_PRIME) >>> 0;
	accumulated[2] = ((accumulated[2] ^ in_array1[3]) * UINT_32HASH_PRIME) >>> 0;
	accumulated[3] = ((accumulated[3] ^ in_array1[0]) * UINT_32HASH_PRIME) >>> 0;

	return accumulated;
};

/**
 * Takes two guids and generates a new derived GUID.
 *
 * @remarks Note: You should only use this helper function when you need only one combination.
 * Otherwise, it is more efficient to work on the uint8 arrays directly.
 *
 * @param in_guid1 - Input GUID
 * @param in_guid2 - Input GUID
 * @param base64 - Use base64 encoding instead of standart GUIDs
 * @returns Combined GUID
 */
const combineGuids = function (in_guid1: string, in_guid2: string, base64 = false): string {
	const firstArray = guidToUint32x4(in_guid1);
	const secondArray = guidToUint32x4(in_guid2);
	const combined = hashCombine4xUint32(firstArray, secondArray);
	return uint32x4ToGUID(combined, base64);
};

// Make sure the RNG is initialized
guidRNG.initialize();

const initializeGUIDGenerator = (...args) => {
	guidRNG.initialize(...args);
};

/**
 * @internal
 */
export const GuidUtils = {
	uint32x4ToGUID,
	guidToUint32x4,
	base64Tobase16,
	base16ToBase64,
	initializeGUIDGenerator,
	generateGUID,
	isGUID,
	combineGuids,
	hashCombine4xUint32,
};
