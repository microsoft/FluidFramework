/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { takeAsync } from "@fluid-private/stochastic-test-utils";
import { Operation, SharedNothingFactory, baseModel } from "../sharedNothing.js";
import { ChangeConnectionState, DDSFuzzModel, createDDSFuzzSuite } from "../../ddsFuzzHarness.js";

const shortModel: DDSFuzzModel<SharedNothingFactory, Operation | ChangeConnectionState> = {
	...baseModel,
	generatorFactory: () => takeAsync(1, baseModel.generatorFactory()),
};

createDDSFuzzSuite.only(2, 3)(
	{
		...shortModel,
		workloadName: "1: .only via function",
	},
	{
		defaultTestCount: 10,
	},
);

createDDSFuzzSuite(
	{
		...shortModel,
		workloadName: "2: .only via options",
	},
	{
		defaultTestCount: 10,
		only: [4, 7],
	},
);

createDDSFuzzSuite.only(2, 4)(
	{
		...shortModel,
		workloadName: "3: .only via function and options",
	},
	{
		defaultTestCount: 10,
		only: [4, 7],
	},
);
