/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable no-bitwise */

import * as distribution from "./distributions";
import { IRandom } from "./types";
import { XSadd } from "./xsadd";

// Constructs a compliant UUID version 4 from four 32b integers.  UUID version 4 contains
// 6 predetermined bits (bits 48..51 for the version and bits 64..65 for the variant).
// Consequently, only 122 of the provided 128 bits are used.
export function makeUuid4(u32_0: number, u32_1: number, u32_2: number, u32_3: number) {
    const hex = (value: number, digits: number) => value.toString(16).padStart(digits, "0");

    return `${
        hex(u32_0, 8)
    }-${
        hex(u32_1 >>> 16, 4)
    }-${
        // Discard low 4 bits and insert version '0b100'.
        hex(((u32_1 << 16) >>> 20) | 0x4000, 4)
    }-${
        // Insert variant '0b10', discarding the low 2 bits.
        hex((u32_2 >>> 18) | 0x8000, 4)
    }-${
        // Use the 2 bits that were discarded above and instead discard weak low bits.
        hex((u32_2 << 14) >>> 16, 4)
    }${
        hex(u32_3, 8)
    }`;
}

/**
 * Construct a new IRandom instance, optionally seeding it with up to four 32b integers.
 * If no seeds are provided, the PRNG is non-deterministically seeded using Math.random().
 */
export function makeRandom(
    ...seed: [] | [number] | [number, number] | [number, number, number] | [number, number, number, number]
): IRandom {
    const engine = new XSadd(...seed);

    // RATIONALE: These methods are already bound.  (Technically, XSadd is constructed to avoid use
    //            of 'this' for a minor perf win, but the end result is the same.)

    /* eslint-disable @typescript-eslint/unbound-method */
    const real = distribution.real(engine.float64);
    const integer = distribution.integer(engine.uint53);
    const normal = distribution.normal(engine.float64);
    /* eslint-enable @typescript-eslint/unbound-method */

    return {
        bool: (probability = 0.5) => engine.float64() < probability,
        integer,
        normal,
        pick: <T>(items: T[]) => items[integer(0, items.length - 1)],
        real,
        shuffle: <T>(items: T[]) => {
            // Fisher–Yates shuffle
            // See: https://en.wikipedia.org/wiki/Fisher%E2%80%93Yates_shuffle#The_modern_algorithm
            for (let i = items.length - 1; i > 0; i--) {
                const j = integer(0, i);
                const tmp = items[i];
                items[i] = items[j];
                items[j] = tmp;
            }
        },
        string: (length: number, alphabet = "123456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ") => {
            let result = "";

            for (let i = 0; i < length; i++) {
                result += alphabet[integer(0, alphabet.length - 1)];
            }

            return result;
        },
        uuid4: () => makeUuid4(engine.uint32(), engine.uint32(), engine.uint32(), engine.uint32()),
    };
}
