/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { benchmark, BenchmarkType } from '@fluid-tools/benchmark';
import { MockContainerRuntimeFactory } from '@fluidframework/test-runtime-utils';
import { assert } from '../Common';
import { Change, SharedTree } from '../default-edits';
import { EditLog } from '../EditLog';
import { runSummaryLoadPerfTests } from './utilities/SummaryLoadPerfTests';
import {
	createStableEdits,
	setUpLocalServerTestSharedTree,
	setUpTestSharedTree,
	simpleTestTree,
} from './utilities/TestUtilities';

describe('SharedTree Perf', () => {
	let tree: SharedTree | undefined;
	let containerRuntimeFactory: MockContainerRuntimeFactory | undefined;
	for (const count of [1, 1_000]) {
		benchmark({
			type: BenchmarkType.Measurement,
			title: `get currentView with ${count} sequenced edit(s)`,
			before: () => {
				({ tree, containerRuntimeFactory } = setUpTestSharedTree({ initialTree: simpleTestTree }));

				const edits = createStableEdits(count);
				for (let i = 0; i < count - 1; i++) {
					tree.processLocalEdit(edits[i]);
				}

				containerRuntimeFactory.processAllMessages();
				const editLog = tree.edits as EditLog<Change>;
				assert(editLog.numberOfSequencedEdits === count);
				assert(editLog.numberOfLocalEdits === 0);
			},
			benchmarkFn: () => {
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				tree!.currentView;
			},
			after: () => {
				tree = undefined;
				containerRuntimeFactory = undefined;
			},
		});
	}

	runSummaryLoadPerfTests(setUpLocalServerTestSharedTree);
});
