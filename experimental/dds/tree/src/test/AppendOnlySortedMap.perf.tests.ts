/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { makeRandom } from '@fluid-private/stochastic-test-utils';
import { benchmarkDuration, benchmarkIt } from '@fluid-tools/benchmark';

import { compareFiniteNumbers } from '../Common.js';
import { AppendOnlySortedMap } from '../id-compressor/AppendOnlySortedMap.js';

function runAppendOnlyMapPerfTests(mapBuilder: () => AppendOnlySortedMap<number, number>): void {
	const setup = (): { map: AppendOnlySortedMap<number, number>; keyChoices: number[] } => {
		const rand = makeRandom(42);
		const map = mapBuilder();
		let curKey = 0;
		for (let i = 0; i < 100000; i++) {
			map.append(curKey, rand.integer(0, Number.MAX_SAFE_INTEGER));
			curKey += rand.integer(1, 10);
		}
		const keys = [...map.keys()];
		const keyChoices: number[] = [];
		for (let i = 0; i < map.size; i++) {
			keyChoices.push(keys[rand.integer(0, map.size - 1)]);
		}
		return { map, keyChoices };
	};

	benchmarkIt({
		title: `lookup a key`,
		...benchmarkDuration({
			benchmarkFnCustom: async (state) => {
				const { map, keyChoices } = setup();
				let choice = 0;
				state.timeAllBatches(() => {
					map.get(keyChoices[choice++ % keyChoices.length]);
				});
			},
		}),
	});

	benchmarkIt({
		title: `lookup a pair or lower`,
		...benchmarkDuration({
			benchmarkFnCustom: async (state) => {
				const { map, keyChoices } = setup();
				let choice = 0;
				state.timeAllBatches(() => {
					map.getPairOrNextLower(keyChoices[choice++ % keyChoices.length]);
				});
			},
		}),
	});
}

describe('AppendOnlySortedMap Perf', () => {
	runAppendOnlyMapPerfTests(() => new AppendOnlySortedMap(compareFiniteNumbers));
});
