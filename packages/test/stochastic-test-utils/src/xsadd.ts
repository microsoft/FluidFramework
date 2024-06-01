/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable no-bitwise */

import assert from "node:assert/strict";
import { Random } from "best-random";

// Perf: We avoid the use of an ES6 'class' for a modest performance gain, but allow the use
//       of the 'new' keyword using a ctor interface (node 12? x64).

/**
 * Construct a new instance of the XSadd random number generator, seeding it with up to
 * four 32b integers.  If no seeds are provided, the PRNG is non-deterministically seeded
 * using Math.random().
 *
 * @internal
 */
export type XSaddCtor = new (
	seed0?: number,
	seed1?: number,
	seed2?: number,
	seed3?: number,
) => Random;

/**
 * XORSHIFT-ADD (XSadd) is a non-cryptographic PRNG that is tiny, fast, seedable, and has
 * acceptable statistical properties for most test applications.
 *
 * In particular, uint32 output from XSadd passes the BigCrush suite of TestU01, but fails
 * if the bits are reversed due to weakness in the lower bits.
 *
 * See: http://www.math.sci.hiroshima-u.ac.jp/m-mat/MT/XSADD/
 *
 * @internal
 */
export const XSadd: XSaddCtor = function (...seed: number[]): Random {
	// eslint-disable-next-line no-param-reassign
	seed = seed.length ? seed : [...new Array(4)].map(() => (Math.random() * 0x100000000) | 0);

	// Scramble the seeds using an LCG w/Borosh-Niederreiter multiplier.  This reduces correlation
	// between similar initial seeds.  This also helps to avoid unintentionally encountering low bit
	// counts with simple seeds like { 0, 0, 0, 0 }.
	//
	// To avoid a fixed point at state { x: 0, y: 0, z: 0, w: 0 }, continue scrambling until at least
	// one seed is non-zero.
	const seed0 = seed[0]
	const seed1 = seed[1]
	const seed2 = seed[2]
	const seed3 = seed[3]
	assert(seed0 !== undefined, "seed0 is undefined in XSadd");
	assert(seed1 !== undefined, "seed1 is undefined in XSadd");
	assert(seed2 !== undefined, "seed2 is undefined in XSadd");
	assert(seed3 !== undefined, "seed3 is undefined in XSadd");
	for (let i = 1; i < 8 || (seed0 | seed1 | seed2 | seed3) === 0; i++) {
		const seed_i = seed[(i - 1) & 3];
		assert(seed_i !== undefined, "seed_i is undefined in XSadd");
		seed[i & 3] ^= i + Math.imul(0x6c078965, seed_i ^ (seed_i >>> 30));
	}

	const s = {
		x: seed0 | 0,
		y: seed1 | 0,
		z: seed2 | 0,
		w: seed3 | 0,
	};

	const uint32 = () => {
		let t = s.x;
		s.x = s.y;
		s.y = s.z;
		s.z = s.w;

		t ^= t << 15;
		t ^= t >>> 18;
		t ^= s.w << 11;

		s.w = t;

		return (s.w + s.z) >>> 0;
	};

	// Discard first 8 results to further mix seeds.
	for (let i = 0; i < 8; i++) {
		uint32();
	}

	// Note: XSadd is known to produce weak lower bits.  To help compensate, we discard
	//       the low bits of both 32b samples when constructing a 53b value.
	const uint53 = () => (uint32() >>> 6) * 0x8000000 + (uint32() >>> 5);

	return {
		uint32,
		uint53,
		float64: () => uint53() / 0x20000000000000,
	};
} as any;
