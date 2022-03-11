/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { SharedTree } from '../default-edits';
import { WriteFormat } from '../generic';
import { setUpTestSharedTree, setUpLocalServerTestSharedTree } from './utilities/TestUtilities';
import { runSharedTreeOperationsTests } from './utilities/SharedTreeTests';
import { runSummaryFormatCompatibilityTests } from './utilities/SummaryFormatCompatibilityTests';
import { runSummarySizeTests } from './utilities/SummarySizeTests';
import { runPendingLocalStateTests } from './utilities/PendingLocalStateTests';
import { runSharedTreeVersioningTests } from './utilities/SharedTreeVersioningTests';

describe('SharedTree', () => {
	describe('Operations', () => {
		runSharedTreeOperationsTests<SharedTree>('using write format 0.0.2', WriteFormat.v0_0_2, setUpTestSharedTree);
		runSharedTreeOperationsTests<SharedTree>('using write format 0.1.1', WriteFormat.v0_1_1, setUpTestSharedTree);
	});
	runSummaryFormatCompatibilityTests<SharedTree>('Summary', setUpTestSharedTree, setUpLocalServerTestSharedTree);
	runSummarySizeTests<SharedTree>('Summary size', setUpLocalServerTestSharedTree);
	runPendingLocalStateTests<SharedTree>('Pending local state', setUpTestSharedTree, setUpLocalServerTestSharedTree);
	runSharedTreeVersioningTests<SharedTree>('Versioning', setUpTestSharedTree);
});
