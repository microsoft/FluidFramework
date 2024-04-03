/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { runSharedTreeFuzzTests } from './fuzz/SharedTreeFuzzTests.js';

describe('SharedTree', () => {
	runSharedTreeFuzzTests('Fuzz tests with local server');
});
