/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { benchmark, BenchmarkType } from '@fluid-tools/benchmark';
import Prando from 'prando';
import { compareFiniteNumbers } from '../Common';
import { AppendOnlySortedMap } from '../id-compressor/AppendOnlySortedMap';

function runAppendOnlyMapPerfTests(mapBuilder: () => AppendOnlySortedMap<number, number>) {
	const type = BenchmarkType.Measurement;
	let map: AppendOnlySortedMap<number, number>;
	let rand: Prando;
	const keyChoices: number[] = [];
	let localChoice = 0;
	const before = () => {
		rand = new Prando(42);
		map = mapBuilder();
		let curKey = 0;
		for (let i = 0; i < 100000; i++) {
			map.append(curKey, rand.nextInt());
			curKey += rand.nextInt(1, 10);
		}
		const keys = [...map.keys()];
		for (let i = 0; i < map.size; i++) {
			keyChoices.push(keys[rand.nextInt(0, map.size - 1)]);
		}
		localChoice = 0;
	};

	benchmark({
		type,
		title: `lookup a key`,
		before,
		benchmarkFn: () => {
			map.get(keyChoices[localChoice++ % keyChoices.length]);
		},
	});

	benchmark({
		type,
		title: `lookup a pair or lower`,
		before,
		benchmarkFn: () => {
			map.getPairOrNextLower(keyChoices[localChoice++ % keyChoices.length]);
		},
	});
}

describe('AppendOnlySortedMap Perf', () => {
	runAppendOnlyMapPerfTests(() => new AppendOnlySortedMap(compareFiniteNumbers));
});
