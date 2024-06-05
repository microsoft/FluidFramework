/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRandom, makeRandom } from "@fluid-private/stochastic-test-utils";
import { BenchmarkType, benchmark } from "@fluid-tools/benchmark";
import { assert } from "@fluidframework/core-utils/internal";

import { AppendOnlySortedMap } from "../appendOnlySortedMap.js";
import { compareFiniteNumbers } from "../utilities.js";

function runAppendOnlyMapPerfTests(mapBuilder: () => AppendOnlySortedMap<number, number>) {
	const type = BenchmarkType.Measurement;
	let map: AppendOnlySortedMap<number, number>;
	let rand: IRandom;
	const keyChoices: number[] = [];
	let localChoice = 0;
	const before = () => {
		rand = makeRandom(42);
		map = mapBuilder();
		let curKey = 0;
		for (let i = 0; i < 100000; i++) {
			map.append(curKey, rand.integer(0, Number.MAX_SAFE_INTEGER));
			curKey += rand.integer(1, 10);
		}
		const keys = [...map.keys()];
		for (let i = 0; i < map.size; i++) {
			const randomKey = keys[rand.integer(0, map.size - 1)];
			assert(randomKey !== undefined, "randomKey is undefined in runAppendOnlyMapPerfTests");
			keyChoices.push(randomKey);
		}
		localChoice = 0;
	};
	const key = keyChoices[localChoice++ % keyChoices.length];
	assert(key !== undefined, "key is undefined in runAppendOnlyMapPerfTests");

	benchmark({
		type,
		title: `lookup a key`,
		before,
		benchmarkFn: () => {
			map.get(key);
		},
	});

	benchmark({
		type,
		title: `lookup a pair or lower`,
		before,
		benchmarkFn: () => {
			map.getPairOrNextLower(key);
		},
	});
}

describe("AppendOnlySortedMap Perf", () => {
	runAppendOnlyMapPerfTests(() => new AppendOnlySortedMap(compareFiniteNumbers));
});
