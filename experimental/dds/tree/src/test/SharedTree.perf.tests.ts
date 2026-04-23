/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from 'assert';

import { benchmarkDuration, benchmarkIt } from '@fluid-tools/benchmark';

import { EditLog } from '../EditLog.js';

import { runSummaryLoadPerfTests } from './utilities/SummaryLoadPerfTests.js';
import { createStableEdits, setUpTestSharedTree } from './utilities/TestUtilities.js';

describe('SharedTree Perf', () => {
	for (const count of [1, 1_000]) {
		benchmarkIt({
			title: `get currentView with ${count} sequenced edit(s)`,
			...benchmarkDuration({
				benchmarkFnCustom: async (state) => {
					const { tree, containerRuntimeFactory } = setUpTestSharedTree({ localMode: false });
					const edits = createStableEdits(count, tree);
					for (let i = 0; i < count; i++) {
						tree.applyEditInternal(edits[i].changes);
					}
					containerRuntimeFactory.processAllMessages();
					const editLog = tree.edits as EditLog;
					assert(editLog.numberOfSequencedEdits === count);
					assert(editLog.numberOfLocalEdits === 0);
					state.timeAllBatches(() => {
						tree.currentView;
					});
				},
			}),
		});
	}

	runSummaryLoadPerfTests('Summary Load');
});
