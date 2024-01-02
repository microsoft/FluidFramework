/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { testCodec } from "./editManagerCodecs.test";
import { testCorrectness } from "./editManagerCorrectness.test";
import { testPerf } from "./editManagerPerf.spec";

describe("EditManager", () => {
	testCodec();
	testCorrectness();
	testPerf();
});
