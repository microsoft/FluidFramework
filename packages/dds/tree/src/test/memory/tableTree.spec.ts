/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { runBenchmarkTestSuite } from "../tableTreeBenchmarks.js";


describe.skip("TableSchema Benchmarks", () => {
	runBenchmarkTestSuite("memory");
});
