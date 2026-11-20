/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from 'assert';

import { MockFluidDataStoreRuntime } from '@fluidframework/test-runtime-utils/internal';

import { createSharedTree, SharedTreeFactory } from '../index.js';
import { WriteFormat } from '../persisted-types/index.js';

import { runSummaryTests } from './Summary.tests.js';
import { runPendingLocalStateTests } from './utilities/PendingLocalStateTests.js';
import { runSharedTreeOperationsTests } from './utilities/SharedTreeTests.js';
import { runSharedTreeVersioningTests } from './utilities/SharedTreeVersioningTests.js';
import { runSummarySizeTests } from './utilities/SummarySizeTests.js';
import { setUpLocalServerTestSharedTree, setUpTestSharedTree } from './utilities/TestUtilities.js';

describe('SharedTree', () => {
	describe('createSharedTree', () => {
		for (const writeFormat of [WriteFormat.v0_0_2, WriteFormat.v0_1_1]) {
			it(`uses the registered factory with write format ${writeFormat}`, () => {
				const runtime = new MockFluidDataStoreRuntime({
					registry: [new SharedTreeFactory(writeFormat)],
				});
				const tree = createSharedTree(runtime, 'tree');

				assert.equal(tree.id, 'tree');
				assert.equal(tree.getRuntime(), runtime);
				assert.equal(tree.getWriteFormat(), writeFormat);
				assert.equal(tree.edits.length, 0);
				assert.equal(tree.connected, false);
			});
		}

		it('lets the runtime generate an ID when no ID is supplied', () => {
			const runtime = new MockFluidDataStoreRuntime({
				registry: [new SharedTreeFactory(WriteFormat.v0_1_1)],
			});

			const first = createSharedTree(runtime);
			const second = createSharedTree(runtime);

			assert.equal(typeof first.id, 'string');
			assert.notEqual(first.id, second.id);
		});
	});

	describe('Operations', () => {
		runSharedTreeOperationsTests('using write format 0.0.2', WriteFormat.v0_0_2, setUpTestSharedTree);
		runSharedTreeOperationsTests('using write format 0.1.1', WriteFormat.v0_1_1, setUpTestSharedTree);
	});
	runSummaryTests('Summaries');
	runSummarySizeTests('Summary size', setUpLocalServerTestSharedTree);
	runPendingLocalStateTests('Stashed ops', setUpLocalServerTestSharedTree);
	runSharedTreeVersioningTests('Versioning', setUpTestSharedTree);
});
