/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRandom, makeRandom } from '@fluid-private/stochastic-test-utils';
import { BenchmarkType, benchmarkIt, collectDurationData } from '@fluid-tools/benchmark';

import { compareFiniteNumbers } from '../Common.js';
import { AppendOnlySortedMap } from '../id-compressor/AppendOnlySortedMap.js';

function runAppendOnlyMapPerfTests(mapBuilder: () => AppendOnlySortedMap<number, number>): void {
	const type = BenchmarkType.Measurement;
	let map: AppendOnlySortedMap<number, number>;
	let rand: IRandom;
	const keyChoices: number[] = [];
	let localChoice = 0;
	const setup = (): void => {
		rand = makeRandom(42);
		map = mapBuilder();
		let curKey = 0;
		for (let i = 0; i < 100000; i++) {
			map.append(curKey, rand.integer(0, Number.MAX_SAFE_INTEGER));
			curKey += rand.integer(1, 10);
		}
		const keys = [...map.keys()];
		for (let i = 0; i < map.size; i++) {
			keyChoices.push(keys[rand.integer(0, map.size - 1)]);
		}
		localChoice = 0;
	};

	benchmarkIt({
		type,
		title: `lookup a key`,
		run: async () => {
			setup();
			return collectDurationData({
				benchmarkFn: () => {
					map.get(keyChoices[localChoice++ % keyChoices.length]);
				},
			});
		},
	});

	benchmarkIt({
		type,
		title: `lookup a pair or lower`,
		run: async () => {
			setup();
			return collectDurationData({
				benchmarkFn: () => {
					map.getPairOrNextLower(keyChoices[localChoice++ % keyChoices.length]);
				},
			});
		},
	});
}

describe('AppendOnlySortedMap Perf', () => {
	runAppendOnlyMapPerfTests(() => new AppendOnlySortedMap(compareFiniteNumbers));
});
