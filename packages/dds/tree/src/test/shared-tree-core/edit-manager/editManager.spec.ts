/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { testCodec } from "./editManagerCodecs.spec.js";
import { testCorrectness } from "./editManagerCorrectness.spec.js";
import { testPerf } from "./editManagerPerf.spec.js";

describe("EditManager", () => {
	testCodec();
	testCorrectness();
	testPerf();
});
