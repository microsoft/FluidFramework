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

// A chi-squared test is a reasonable assessment of whether the observed distribution matches the expected one.
// https://en.wikipedia.org/wiki/Chi-squared_test
export function computeChiSquared<T>(
	weights: [T, number][],
	sampleCounts: Counter<T>,
): number {
	const values = Array.from(sampleCounts.values());

	assert.deepEqual(
		new Set(weights.filter(([_, weight]) => weight > 0).map(([value]) => value)),
		new Set(values),
		"'weights' must include all choices and all choices must have at least occurrence in 'sampleCounts'.",
	);

	if (weights.length === 1) {
		const [value, weight] = weights[0];

		assert.deepEqual(
			weights,
			[[value, 1.0]],
			`With a single choice the associated weight must be 1.0, but got ${weight}.`,
		);

		return 0;
	}

	const numberOfSamples = Array.from(sampleCounts.counts()).reduce(
		(partialSum, value) => partialSum + value,
	);
	const totalWeight = weights.reduce<number>(
		(partialSum, [, weight]) => partialSum + weight,
		0,
	);

	let chiSquared = 0;
	for (const [value, weight] of weights) {
		if (weight === 0) {
			assert.equal(sampleCounts.get(value), 0, "weight 0 value generated");
			continue;
		}
		const expectedFrequency = (numberOfSamples * weight) / totalWeight;
		const actualFrequency = sampleCounts.get(value);

		assert(
			actualFrequency !== undefined,
			`Must run sufficient iterations to produce all choices, but missing ${JSON.stringify(
				value,
			)}.`,
		);

		chiSquared +=
			(actualFrequency - expectedFrequency) ** 2 /
			(expectedFrequency * (1 - weight / totalWeight));
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

	const actual = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
		16,
		18,
	)}${hex.slice(18, 20)}-${hex.slice(20, 32)}`;

	assert.equal(actual, uuid);

	return bytes;
}

// These are 99% thresholds, i.e. for 1 degree of freedom, there's a 99% chance that a random sample of the
// expected distribution produces a result with chi squared at most 6.63.
//
// (These are technically probabilities for underlying normal distribution, but by the central limit theorem,
// a multinomial distribution with large sample size approaches one.)
export const chiSquaredCriticalValues = [
	/*  0: */ 0.0, /*  1: */ 6.635, /*  2: */ 9.21, /*  3: */ 11.345, /*  4: */ 13.277,
	/*  5: */ 15.086, /*  6: */ 16.812, /*  7: */ 18.475, /*  8: */ 20.09, /*  9: */ 21.666,
	/* 10: */ 23.209, /* 11: */ 24.725, /* 12: */ 26.217, /* 13: */ 27.688, /* 14: */ 29.141,
	/* 15: */ 30.578, /* 16: */ 32.0, /* 17: */ 33.409, /* 18: */ 34.805, /* 19: */ 36.191,
	/* 20: */ 37.566, /* 21: */ 38.932, /* 22: */ 40.289, /* 23: */ 41.638, /* 24: */ 42.98,
	/* 25: */ 44.314, /* 26: */ 45.642, /* 27: */ 46.963, /* 28: */ 48.278, /* 29: */ 49.588,
	/* 30: */ 50.892, /* 31: */ 52.191, /* 32: */ 53.486, /* 33: */ 54.776, /* 34: */ 56.061,
	/* 35: */ 57.342, /* 36: */ 58.619, /* 37: */ 59.893, /* 38: */ 61.162, /* 39: */ 62.428,
	/* 40: */ 63.691, /* 41: */ 64.95, /* 42: */ 66.206, /* 43: */ 67.459, /* 44: */ 68.71,
	/* 45: */ 69.957, /* 46: */ 71.201, /* 47: */ 72.443, /* 48: */ 73.683, /* 49: */ 74.919,
	/* 50: */ 76.154, /* 51: */ 77.386, /* 52: */ 78.616, /* 53: */ 79.843, /* 54: */ 81.069,
	/* 55: */ 82.292, /* 56: */ 83.513, /* 57: */ 84.733, /* 58: */ 85.95, /* 59: */ 87.166,
	/* 60: */ 88.379, /* 61: */ 89.591, /* 62: */ 90.802, /* 63: */ 92.01, /* 64: */ 93.217,
	/* 65: */ 94.422, /* 66: */ 95.626, /* 67: */ 96.828, /* 68: */ 98.028, /* 69: */ 99.228,
	/* 70: */ 100.425, /* 71: */ 101.621, /* 72: */ 102.816, /* 73: */ 104.01, /* 74: */ 105.202,
	/* 75: */ 106.393, /* 76: */ 107.583, /* 77: */ 108.771, /* 78: */ 109.958,
	/* 79: */ 111.144, /* 80: */ 112.329, /* 81: */ 113.512, /* 82: */ 114.695,
	/* 83: */ 115.876, /* 84: */ 117.057, /* 85: */ 118.236, /* 86: */ 119.414,
	/* 87: */ 120.591, /* 88: */ 121.767, /* 89: */ 122.942, /* 90: */ 124.116,
	/* 91: */ 125.289, /* 92: */ 126.462, /* 93: */ 127.633, /* 94: */ 128.803,
	/* 95: */ 129.973, /* 96: */ 131.141, /* 97: */ 132.309, /* 98: */ 133.476,
	/* 99: */ 134.642,
];
