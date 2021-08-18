/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { SharedTree } from '../default-edits';
import { setUpTestSharedTree, setUpLocalServerTestSharedTree } from './utilities/TestUtilities';
import { runSharedTreeOperationsTests } from './utilities/SharedTreeTests';
import { runSummaryFormatCompatibilityTests } from './utilities/SummaryFormatCompatibilityTests';
import { runSummarySizeTests } from './utilities/SummarySizeTests';

describe('SharedTree', () => {
	runSharedTreeOperationsTests<SharedTree>('Operations', setUpTestSharedTree);
	runSummaryFormatCompatibilityTests<SharedTree>('Summary', setUpTestSharedTree, setUpLocalServerTestSharedTree);
	runSummarySizeTests<SharedTree>('Summary size', setUpLocalServerTestSharedTree);
});
