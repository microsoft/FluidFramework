/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { benchmark, BenchmarkType } from '@fluid-tools/benchmark';
import { Change, Insert, StablePlace } from '../default-edits';
import { EditLog } from '../EditLog';
import { Edit, newEdit } from '../generic';
import { makeTestNode, testTrait } from './utilities/TestUtilities';

describe('EditLog Perf', () => {
	const insertNumbers = [10, 50, 100, 500, 1000];

	insertNumbers.forEach((numberOfInserts) => {
		const edits: Edit<Change>[] = [];

		for (let i = 0; i < numberOfInserts; i++) {
			edits.push(newEdit(Insert.create([makeTestNode()], StablePlace.atEndOf(testTrait))));
		}

		benchmark({
			type: BenchmarkType.Measurement,
			title: `process ${numberOfInserts} sequenced inserts`,
			benchmarkFn: () => {
				const log = new EditLog();

				edits.forEach((edit) => {
					log.addSequencedEdit(edit, { sequenceNumber: 1, referenceSequenceNumber: 0 });
				});
			},
		});
	});
});
