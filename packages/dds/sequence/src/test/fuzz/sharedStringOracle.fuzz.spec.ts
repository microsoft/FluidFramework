/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import { createDDSFuzzSuite, type DDSFuzzHarnessEvents } from "@fluid-private/test-dds-utils";

import { SharedStringOracle } from "../../sharedStringOracle.js";

import {
	baseSharedStringModel,
	defaultFuzzOptions,
	type OracleSharedString,
} from "./fuzzUtils.js";

const emitter = new TypedEventEmitter<DDSFuzzHarnessEvents>();

emitter.on("clientCreate", (client) => {
	const channel = client.channel as OracleSharedString;
	const oracle = new SharedStringOracle(channel);

	channel.oracle = oracle;
});

describe("SharedString oracle fuzz testing", () => {
	createDDSFuzzSuite(
		{ ...baseSharedStringModel, workloadName: "SharedString oracle" },
		{
			...defaultFuzzOptions,
			emitter,
		},
	);
});
