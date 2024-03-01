/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Operation, SharedNothingFactory, baseModel } from "../sharedNothing.js";
import { ChangeConnectionState, DDSFuzzModel, createDDSFuzzSuite } from "../../ddsFuzzHarness.js";
import { _dirname } from "./dirname.cjs";

const model: DDSFuzzModel<SharedNothingFactory, Operation | ChangeConnectionState> = {
	...baseModel,
	workloadName: "failing configuration",
	// note: overriding the infinite generator isn't necessary here as the test
	// should exit immediately.
	reducer: async () => {
		throw new Error("Injected failure");
	},
};

createDDSFuzzSuite(model, {
	defaultTestCount: 2,
	// Note: this should place files in dist/test-dds-utils/ddsSuiteCases/failing-configuration
	saveFailures: { directory: _dirname },
});
