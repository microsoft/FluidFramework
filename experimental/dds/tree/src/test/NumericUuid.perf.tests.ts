/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { BenchmarkType, benchmarkDuration, benchmarkIt } from '@fluid-tools/benchmark';

import { assertIsStableId, generateStableId } from '../UuidUtilities.js';
import { defaultClusterCapacity } from '../id-compressor/IdCompressor.js';
import {
	getPositiveDelta,
	incrementUuid,
	numericUuidFromStableId,
	stableIdFromNumericUuid,
} from '../id-compressor/NumericUuid.js';

describe('NumericUuid Perf', () => {
	const stableId = assertIsStableId('4779fbf2-2012-4510-b4f0-28a99a9f8946');
	const stableId2 = assertIsStableId('5ccf492c-6a82-438c-9129-d76467525912');
	const stableId3 = assertIsStableId('5ccf492c-6a82-438c-9129-d76467515912');
	const uuid = numericUuidFromStableId(stableId);
	const uuid2 = numericUuidFromStableId(stableId2);
	const uuid3 = numericUuidFromStableId(stableId3);
	const deltaMax = 2 ** 52 - 1;
	const type = BenchmarkType.Measurement;
	benchmarkIt({
		type,
		title: `convert uuid string to numeric uuid`,
		...benchmarkDuration({
			benchmarkFn: () => {
				numericUuidFromStableId(stableId);
			},
		}),
	});
	benchmarkIt({
		type,
		title: `incrementing a uuid`,
		...benchmarkDuration({
			benchmarkFn: () => {
				incrementUuid(uuid, defaultClusterCapacity);
			},
		}),
	});
	benchmarkIt({
		type,
		title: `convert a uuid string into a session uuid`,
		...benchmarkDuration({
			benchmarkFn: () => {
				numericUuidFromStableId(stableId);
			},
		}),
	});
	benchmarkIt({
		type,
		title: `convert an numeric uuid into a uuid string`,
		...benchmarkDuration({
			benchmarkFn: () => {
				stableIdFromNumericUuid(uuid);
			},
		}),
	});
	benchmarkIt({
		type,
		title: `compute the delta between two distant numeric uuids`,
		...benchmarkDuration({
			benchmarkFn: () => {
				getPositiveDelta(uuid, uuid2, deltaMax);
			},
		}),
	});
	benchmarkIt({
		type,
		title: `compute the delta between two close numeric uuids`,
		...benchmarkDuration({
			benchmarkFn: () => {
				getPositiveDelta(uuid2, uuid3, deltaMax);
			},
		}),
	});
	benchmarkIt({
		type,
		title: `generate a random v4 uuid string`,
		...benchmarkDuration({
			benchmarkFn: () => {
				generateStableId();
			},
		}),
	});
});
