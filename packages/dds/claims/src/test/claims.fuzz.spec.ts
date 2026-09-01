/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { createDDSFuzzSuite } from "@fluid-private/test-dds-utils";
import { FlushMode } from "@fluidframework/runtime-definitions/internal";

import { baseClaimsModel, defaultOptions } from "./fuzzUtils.js";

describe("Claims fuzz testing", () => {
	createDDSFuzzSuite(baseClaimsModel, {
		...defaultOptions,
		// Uncomment this line to replay a specific seed:
		// replay: 0,
	});
});

describe("Claims fuzz testing with rebasing", () => {
	createDDSFuzzSuite(baseClaimsModel, {
		...defaultOptions,
		containerRuntimeOptions: {
			flushMode: FlushMode.TurnBased,
			enableGroupedBatching: true,
		},
		rebaseProbability: 0.15,
		// Uncomment this line to replay a specific seed:
		// replay: 0,
	});
});
