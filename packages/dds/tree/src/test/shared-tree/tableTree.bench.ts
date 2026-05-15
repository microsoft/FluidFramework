/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { runBenchmarkTestSuite } from "../tableTreeBenchmarks.js";

// TODO: AB#71782: Investigate why these tests are so slow / possibly contain cross-test contamination and address those issue, then re-enable these tests.
describe.skip("TableSchema Benchmarks", () => {
	runBenchmarkTestSuite("execution-time");
	runBenchmarkTestSuite("memory");
});
