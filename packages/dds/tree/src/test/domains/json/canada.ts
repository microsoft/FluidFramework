/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { makeRandom } from "@fluid-private/stochastic-test-utils";

import { FieldKey } from "../../../core/index.js";
import { JsonCompatibleReadOnly, brand } from "../../../util/index.js";

export interface Canada {
	readonly [P: string]: JsonCompatibleReadOnly | undefined;
	type: "FeatureCollection";
	features: [
		{
			type: "Feature";
			properties: { name: "Canada" };
			geometry: {
				type: "Polygon";
				coordinates: [number, number][][];
			};
		},
	];
}

export const Canada = {
	// Shared tree keys that map to the type used by the Canada dataset
	SharedTreeFieldKey: {
		features: brand<FieldKey>("features"),
		geometry: brand<FieldKey>("geometry"),
		coordinates: brand<FieldKey>("coordinates"),
	},
};

// The geometry of 'canada.json' is encoded as 480 segments of varying length.
const originalSegmentLengths = [
	14, 33, 18, 23, 10, 28, 9, 28, 279, 221, 11, 86, 28, 19, 26, 23, 24, 38, 24, 9, 30, 20, 27, 21,
	19, 25, 24, 20, 19, 18, 34, 19, 28, 12, 38, 30, 91, 17, 23, 28, 22, 24, 19, 44, 21, 19, 21, 24,
	21, 24, 15, 20, 28, 18, 474, 17, 19, 12, 12, 1436, 31, 27, 26, 40, 21, 20, 27, 21, 19, 18, 24,
	20, 65, 27, 36, 21, 27, 28, 24, 17, 20, 17, 12, 21, 24, 24, 31, 71, 224, 9, 147, 30, 20, 18, 22,
	37, 13, 18, 43, 35, 20, 14, 71, 12, 26, 87, 23, 240, 29, 11, 22, 19, 18, 19, 22, 26, 11, 20, 23,
	46, 28, 23, 29, 12, 21, 19, 24, 25, 23, 25, 30, 19, 46, 40, 172, 21, 18, 18, 28, 28, 67, 14, 27,
	18, 23, 29, 21, 25, 28, 19, 22, 20, 29, 14, 24, 26, 21, 38, 47, 19, 20, 21, 60, 21, 26, 31, 19,
	15, 82, 19, 32, 22, 19, 22, 12, 15, 37, 46, 14, 169, 18, 24, 20, 44, 17, 17, 19, 24, 18, 18, 22,
	16, 33, 16, 47, 19, 22, 22, 19, 24, 16, 42, 30, 15, 25, 15, 15, 18, 21, 15, 29, 18, 22, 21, 18,
	21, 17, 26, 38, 21, 16, 22, 14, 16, 26, 16, 19, 35, 33, 18, 606, 16, 17, 15, 47, 17, 13, 16,
	103, 13, 19, 17, 37, 35, 19, 17, 13, 26, 24, 37, 27, 20, 17, 23, 17, 21, 20, 16, 34, 24, 22, 18,
	19, 26, 18, 15, 20, 14, 17, 15, 28, 18, 23, 13, 16, 16, 13, 21, 18, 22, 21, 74, 24, 18, 18, 13,
	15, 13, 20, 13, 22, 17, 17, 17, 63, 32, 109, 26, 20, 17, 15, 10, 27, 12, 21, 17, 38, 26, 20, 13,
	66, 24, 17, 43, 13, 33, 38, 11, 22, 18, 20, 15, 15, 44, 11, 18, 24, 13, 24, 24, 77, 26, 56, 21,
	19, 32, 55, 46, 16, 16, 18, 54, 29, 22, 17, 257, 23, 70, 22, 90, 30, 21, 16, 19, 396, 40, 18,
	115, 19, 16, 20, 17, 15, 16, 17, 19, 19, 21, 20, 28, 14, 21, 61, 18, 15, 64, 34, 34, 23, 22,
	14310, 70, 57, 19, 19, 28, 23, 18, 15, 12, 14, 11, 14, 19, 25, 15, 39, 44, 21, 2121, 10, 32, 23,
	19, 116, 188, 8221, 17, 733, 23, 54, 399, 22, 534, 31, 37, 18, 38, 46, 205, 70, 18, 18, 20, 18,
	37, 20, 40, 49, 13, 102, 93, 72, 25, 16, 64, 17, 14, 87, 837, 39, 23, 40, 57, 1162, 16, 39, 16,
	17, 1584, 15, 26, 27, 26, 34, 601, 35, 58, 87, 115, 24, 51, 51, 178, 23, 38, 24, 26, 131, 25,
	251, 43, 475, 67, 24, 32, 1447, 21, 19, 5276,
];

/**
 * Generates a Jsonable tree with statistical similarities to 'canada.json':
 * https://raw.githubusercontent.com/serde-rs/json-benchmark/master/data/canada.json
 */
export function generateCanada(segmentLengths = originalSegmentLengths, seed = 1): Canada {
	const random = makeRandom(seed);

	// Distribution parameters were calculated from 'canada.json', rounded for brevity,
	// and then the gzipped size compared with the original tree to verify that the
	// these choices generate a tree with similar entropy.
	const vxDist = () => random.normal(/* mean: */ 0, /* stdDev: */ 75);
	const vyDist = () => random.normal(/* mean: */ 0, /* stdDev: */ 20);
	const noiseDist = () => random.real(/* min: */ -18e-14, /* max: */ 18e-14);

	let last_x = -65;
	let last_y = 43;

	// To generate geometry similar to 'canada.json', we map the array of segment lengths to
	// an array of segments, where the coordinates of each segment is randomly generated using
	// Brownian motion.
	const segments = segmentLengths.map((len: number) => {
		const clamp = (min: number, value: number, max: number) =>
			Math.max(Math.min(value, max), min);

		// An interesting detail of 'canada.json' is that coordinates typically have ~6 digits of
		// precision, followed by ~8 consecutive zeros or nines, and then a couple additional digits.
		// We generate similar coordinates by truncating values to 6 digits of precision and then
		// adding a very small amount of noise.
		const noise = (x: number) => Math.trunc(x * 1000000) / 1000000 + noiseDist();

		return new Array(len)
			.fill(0)
			.map(
				() =>
					[
						(last_x = noise(clamp(-141, last_x + vxDist(), -52))),
						(last_y = noise(clamp(41, last_y + vyDist(), 83))),
					] as [number, number],
			);
	});

	return {
		type: "FeatureCollection",
		features: [
			{
				type: "Feature",
				properties: { name: "Canada" },
				geometry: { type: "Polygon", coordinates: segments },
			},
		],
	};
}
