/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { benchmark, BenchmarkType } from '@fluid-tools/benchmark';
import { v4 } from 'uuid';
import { defaultClusterCapacity } from '../id-compressor/IdCompressor';
import {
	getPositiveDelta,
	incrementUuid,
	numericUuidFromStableId,
	stableIdFromNumericUuid,
	minimizeUuidString,
	assertIsStableId,
} from '../id-compressor/NumericUuid';
import { UuidString } from '../Identifiers';

describe('NumericUuid Perf', () => {
	const stableId = assertIsStableId('4779fbf220124510b4f028a99a9f8946');
	const stableId2 = assertIsStableId('5ccf492c6a82438c9129d76467525912');
	const uuid = numericUuidFromStableId(stableId);
	const uuid2 = numericUuidFromStableId(stableId2);
	const deltaMax = 2 ** 52 - 1;
	const type = BenchmarkType.Measurement;
	benchmark({
		type,
		title: `convert uuid string to numeric uuid`,
		benchmarkFn: () => {
			numericUuidFromStableId(stableId);
		},
	});
	benchmark({
		type,
		title: `incrementing a uuid`,
		benchmarkFn: () => {
			incrementUuid(uuid, defaultClusterCapacity);
		},
	});
	benchmark({
		type,
		title: `convert a uuid string into a session uuid`,
		benchmarkFn: () => {
			numericUuidFromStableId(stableId);
		},
	});
	benchmark({
		type,
		title: `convert an numeric uuid into a uuid string`,
		benchmarkFn: () => {
			stableIdFromNumericUuid(uuid);
		},
	});
	benchmark({
		type,
		title: `compute the delta between two numeric uuids`,
		benchmarkFn: () => {
			getPositiveDelta(uuid, uuid2, deltaMax);
		},
	});
	benchmark({
		type,
		title: `generate a random v4 uuid string and remove separators`,
		benchmarkFn: () => {
			minimizeUuidString(v4() as UuidString);
		},
	});
});
