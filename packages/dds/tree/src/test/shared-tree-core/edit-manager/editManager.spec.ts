/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { testCodec } from "./editManagerCodecs.test.js";
import { testCorrectness, testOpBunching } from "./editManagerCorrectness.test.js";
import { testPerf } from "./editManagerPerf.test.js";

describe.only("EditManager", () => {
	testOpBunching();
	testCodec();
	testCorrectness();
	testPerf();
});
