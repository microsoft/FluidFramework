/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { runBenchmark } from "./editManager.bench";
import { testCodec } from "./editManagerCodecs.spec";
import { testCorrectness } from "./editManagerCorrectness.spec";
import { testPerf } from "./editManagerPerf.spec";

describe("EditManager", () => {
	testCodec();
	testCorrectness();
	testPerf();
	runBenchmark();
});
