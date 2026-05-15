/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { runBenchmarkTestSuite } from "./matrixBenchmarks.js";

describe("Matrix Benchmarks", () => {
	runBenchmarkTestSuite("execution-time");
	runBenchmarkTestSuite("memory");
});
