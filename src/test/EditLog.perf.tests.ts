/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { benchmark, BenchmarkType } from '@fluid-tools/benchmark';
import { Change, Insert, StablePlace } from '../default-edits';
import { EditLog } from '../EditLog';
import { Edit, newEdit } from '../generic';
import { reservedIdCount } from '../generic/GenericSharedTree';
import { IdCompressor } from '../id-compressor';
import { createSessionId } from '../id-compressor/NumericUuid';
import { setUpTestTree } from './utilities/TestUtilities';

describe('EditLog Perf', () => {
	const insertNumbers = [10, 50, 100, 500, 1000];

	insertNumbers.forEach((numberOfInserts) => {
		const edits: Edit<Change>[] = [];

		const testTree = setUpTestTree(new IdCompressor(createSessionId(), reservedIdCount));
		for (let i = 0; i < numberOfInserts; i++) {
			edits.push(newEdit(Insert.create([testTree.buildLeaf()], StablePlace.atEndOf(testTree.traitLocation))));
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
