/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable no-bitwise */

import { RandomCtor, Random } from "best-random";

/**
 * XORSHIFT-ADD (XSadd) is a non-cryptographic PRNG that is tiny, fast, seedable, and has
 * acceptable statistical properties for most test applications.
 *
 * In particular, uint32 output from XSadd passes the BigCrush suite of TestU01, but fails
 * if the bits are reversed due to weaknesses in the lower bits.
 *
 * See: http://www.math.sci.hiroshima-u.ac.jp/m-mat/MT/XSADD/
 */
export const XSadd: RandomCtor =
    function(...seed: number[]): Random {
        // eslint-disable-next-line no-param-reassign
        seed = seed.length
            ? seed
            : [...new Array(4)].map(() => (Math.random() * 0x100000000) | 0);

        // Scramble the seeds using an LCG w/Borosh-Niederreiter multiplier.  This reduces correlation
        // between similar initial seeds.  Continue scrambling until at least one seed is non-zero
        // to avoid the fixed point at state { 0, 0, 0, 0 }.
        for (let i = 1; (i < 8) || (seed[0] | seed[1] | seed[2] | seed[3]) === 0; i++) {
            const seed_i = seed[(i - 1) & 3];
            seed[i & 3] ^= i + Math.imul(0x6C078965, (seed_i ^ (seed_i >>> 30)) >>> 0) >>> 0;
        }

        const s = {
            x: seed[0] | 0,
            y: seed[1] | 0,
            z: seed[2] | 0,
            w: seed[3] | 0,
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
        for (let i = 0; i < 8; i++) { uint32(); }

        // Note: XSadd is known to produce weak lower bits.  To help compensate, we discard
        //       the low bits of both 32b samples when constructing a 53b value.
        const uint53 = () => ((uint32() >>> 6) * 0x8000000) + (uint32() >>> 5);

        return {
            uint32,
            uint53,
            float64: () => uint53() / 0x20000000000000,
        };
    } as any;
