/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { WriteFormat } from '../persisted-types';
import { setUpTestSharedTree, setUpLocalServerTestSharedTree } from './utilities/TestUtilities';
import { runSharedTreeOperationsTests } from './utilities/SharedTreeTests';
import { runSummarySizeTests } from './utilities/SummarySizeTests';
import { runPendingLocalStateTests } from './utilities/PendingLocalStateTests';
import { runSharedTreeVersioningTests } from './utilities/SharedTreeVersioningTests';
import { runSharedTreeFuzzTests } from './fuzz/SharedTreeFuzzTests';

describe('SharedTree', () => {
	describe('Operations', () => {
		runSharedTreeOperationsTests('using write format 0.0.2', WriteFormat.v0_0_2, setUpTestSharedTree);
		runSharedTreeOperationsTests('using write format 0.1.1', WriteFormat.v0_1_1, setUpTestSharedTree);
	});
	runSummarySizeTests('Summary size', setUpLocalServerTestSharedTree);
	runPendingLocalStateTests('Pending local state', setUpTestSharedTree, setUpLocalServerTestSharedTree);
	runSharedTreeVersioningTests('Versioning', setUpTestSharedTree);
	runSharedTreeFuzzTests('Fuzz tests with local server');
});
