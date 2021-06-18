/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SharedTree } from '../default-edits';
import { setUpTestSharedTree, setUpLocalServerTestSharedTree } from './utilities/TestUtilities';
import { runSharedTreeOperationsTests } from './utilities/SharedTreeTests';
import { runSummaryTests } from './utilities/SummaryFormatCompatibilityTests';

describe('SharedTree', () => {
	runSharedTreeOperationsTests<SharedTree>('Operations', setUpTestSharedTree);
	runSummaryTests<SharedTree>('Summary', setUpTestSharedTree, setUpLocalServerTestSharedTree);
});
