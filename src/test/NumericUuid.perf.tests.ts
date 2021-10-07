/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { benchmark, BenchmarkType } from '@fluid-tools/benchmark';
import { v4 } from 'uuid';
import { fail } from '../Common';
import { defaultClusterCapacity } from '../id-compressor/IdCompressor';
import {
	getPositiveDelta,
	incrementUuid,
	numericUuidFromUuidString,
	stableIdFromNumericUuid,
	minimizeUuidString,
} from '../id-compressor/NumericUuid';
import { StableId, UuidString } from '../Identifiers';

describe('NumericUuid Perf', () => {
	const stableId = '4779fbf220124510b4f028a99a9f8946' as StableId;
	const stableId2 = '5ccf492c6a82438c9129d76467525912' as StableId;
	const uuid = numericUuidFromUuidString(stableId) ?? fail('not reachable');
	const uuid2 = numericUuidFromUuidString(stableId2) ?? fail('not reachable');
	const deltaMax = 2 ** 52 - 1;
	const type = BenchmarkType.Measurement;
	benchmark({
		type,
		title: `convert uuid string to numeric uuid`,
		benchmarkFn: () => {
			numericUuidFromUuidString(stableId);
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
			numericUuidFromUuidString(stableId);
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
