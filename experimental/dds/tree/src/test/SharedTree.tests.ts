/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { WriteFormat } from '../persisted-types/index.js';
import { runSummaryTests } from './Summary.tests.js';
import { runPendingLocalStateTests } from './utilities/PendingLocalStateTests.js';
import { runSharedTreeOperationsTests } from './utilities/SharedTreeTests.js';
import { runSharedTreeVersioningTests } from './utilities/SharedTreeVersioningTests.js';
import { runSummarySizeTests } from './utilities/SummarySizeTests.js';
import { setUpLocalServerTestSharedTree, setUpTestSharedTree } from './utilities/TestUtilities.js';

describe('SharedTree', () => {
	describe('Operations', () => {
		runSharedTreeOperationsTests('using write format 0.0.2', WriteFormat.v0_0_2, setUpTestSharedTree);
		runSharedTreeOperationsTests('using write format 0.1.1', WriteFormat.v0_1_1, setUpTestSharedTree);
	});
	runSummaryTests('Summaries');
	runSummarySizeTests('Summary size', setUpLocalServerTestSharedTree);
	runPendingLocalStateTests('Stashed ops', setUpLocalServerTestSharedTree);
	runSharedTreeVersioningTests('Versioning', setUpTestSharedTree);
});
