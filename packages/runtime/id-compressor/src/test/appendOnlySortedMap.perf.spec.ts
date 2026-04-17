/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { makeRandom } from "@fluid-private/stochastic-test-utils";
import {
	BenchmarkType,
	TestType,
	benchmarkIt,
	collectDurationData,
} from "@fluid-tools/benchmark";

import { AppendOnlySortedMap } from "../appendOnlySortedMap.js";
import { compareFiniteNumbers } from "../utilities.js";

function runAppendOnlyMapPerfTests(
	mapBuilder: () => AppendOnlySortedMap<number, number>,
): void {
	const type = BenchmarkType.Measurement;

	const setup = (): { map: AppendOnlySortedMap<number, number>; keyChoices: number[] } => {
		const rand = makeRandom(42);
		const map = mapBuilder();
		let curKey = 0;
		for (let i = 0; i < 100000; i++) {
			map.append(curKey, rand.integer(0, Number.MAX_SAFE_INTEGER));
			curKey += rand.integer(1, 10);
		}
		const keyChoices: number[] = [];
		const keys = [...map.keys()];
		for (let i = 0; i < map.size; i++) {
			keyChoices.push(keys[rand.integer(0, map.size - 1)]);
		}
		return { map, keyChoices };
	};

	benchmarkIt({
		type,
		testType: TestType.ExecutionTime,
		title: `lookup a key`,
		run: async () => {
			const { map, keyChoices } = setup();
			let localChoice = 0;
			return collectDurationData({
				benchmarkFn: () => {
					map.get(keyChoices[localChoice++ % keyChoices.length]);
				},
			});
		},
	});

	benchmarkIt({
		type,
		testType: TestType.ExecutionTime,
		title: `lookup a pair or lower`,
		run: async () => {
			const { map, keyChoices } = setup();
			let localChoice = 0;
			return collectDurationData({
				benchmarkFn: () => {
					map.getPairOrNextLower(keyChoices[localChoice++ % keyChoices.length]);
				},
			});
		},
	});
}

describe("AppendOnlySortedMap Perf", () => {
	runAppendOnlyMapPerfTests(() => new AppendOnlySortedMap(compareFiniteNumbers));
});
