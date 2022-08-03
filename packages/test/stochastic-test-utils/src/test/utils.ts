/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable no-bitwise */

import { strict as assert } from "assert";

export class Counter<T> {
    private readonly choiceToCount = new Map<T, number>();

    public increment(value: T): void {
        this.choiceToCount.set(value, this.get(value) + 1);
    }

    public get(value: T): number {
        return this.choiceToCount.get(value) ?? 0;
    }

    public entries(): Iterable<[T, number]> {
        return this.choiceToCount.entries();
    }

    public values(): Iterable<T> {
        return this.choiceToCount.keys();
    }

    public counts(): Iterable<number> {
        return this.choiceToCount.values();
    }
}

export function computeChiSquared<T>(weights: [T, number][], sampleCounts: Counter<T>): number {
    const values = Array.from(sampleCounts.values());

    assert.deepEqual(new Set(weights.map(([value]) => value)), new Set(values),
        "'weights' must include all choices and all choices must have at least occurrence in 'sampleCounts'.");

    if (weights.length === 1) {
        const [value, weight] = weights[0];

        assert.deepEqual(weights, [[value, 1.0]],
            `With a single choice the associated weight must be 1.0, but got ${weight}.`);

        return 0;
    }

    const numberOfSamples = Array.from(sampleCounts.counts()).reduce((partialSum, value) => partialSum + value);
    const totalWeight = weights.reduce<number>((partialSum, [, weight]) => partialSum + weight, 0);

    let chiSquared = 0;
    for (const [value, weight] of weights) {
        const expectedFrequency = numberOfSamples * weight / totalWeight;
        const actualFrequency = sampleCounts.get(value);

        assert(actualFrequency !== undefined,
            `Must run sufficient iterations to produce all choices, but missing ${JSON.stringify(value)}.`);

        chiSquared += (actualFrequency - expectedFrequency) ** 2 / (expectedFrequency * (1 - weight / totalWeight));
    }

    return chiSquared;
}

export function parseUuid(uuid: string) {
    // See: https://datatracker.ietf.org/doc/html/rfc4122
    const time_low_4b = parseInt(uuid.slice(0, 8), 16);
    const time_mid_2b = parseInt(uuid.slice(9, 13), 16);
    const time_high_and_version_2b = parseInt(uuid.slice(14, 18), 16);
    const clock_seq_and_reserved_1b = parseInt(uuid.slice(19, 21), 16);
    const clock_seq_low_1b = parseInt(uuid.slice(21, 23), 16);
    const node_6b = parseInt(uuid.slice(24, 36), 16);

    const selectByte = (uint32: number, index: number) => (uint32 << (index * 8)) >>> 24;

    const bytes = [
        /* 0: */ selectByte(time_low_4b, 0),
        /* 1: */ selectByte(time_low_4b, 1),
        /* 2: */ selectByte(time_low_4b, 2),
        /* 3: */ selectByte(time_low_4b, 3),
        /* 4: */ selectByte(time_mid_2b, 2),
        /* 5: */ selectByte(time_mid_2b, 3),
        /* 6: */ selectByte(time_high_and_version_2b, 2),
        /* 7: */ selectByte(time_high_and_version_2b, 3),
        /* 8: */ selectByte(clock_seq_and_reserved_1b, 3),
        /* 9: */ selectByte(clock_seq_low_1b, 3),
        /* A: */ selectByte(node_6b / 0x100000000, 2),
        /* B: */ selectByte(node_6b / 0x100000000, 3),
        /* C: */ selectByte(node_6b, 0),
        /* D: */ selectByte(node_6b, 1),
        /* E: */ selectByte(node_6b, 2),
        /* F: */ selectByte(node_6b, 3),
    ];

    // Sanity check that we can reconstruct the original uuid string from the bytes.
    const hex = bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("");

    const actual = `${
        hex.slice(0, 8)
    }-${
        hex.slice(8, 12)
    }-${
        hex.slice(12, 16)
    }-${
        hex.slice(16, 18)
    }${
        hex.slice(18, 20)
    }-${
        hex.slice(20, 32)
    }`;

    assert.equal(actual, uuid);

    return bytes;
}
