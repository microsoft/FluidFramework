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
	SharedStringFuzzFactory,
	type OracleSharedString,
} from "./fuzzUtils.js";

const emitter = new TypedEventEmitter<DDSFuzzHarnessEvents>();

emitter.on("clientCreate", (client) => {
	const channel = client.channel as OracleSharedString;
	const oracle = new SharedStringOracle(channel);

	channel.oracle = oracle;
});

export class OracleSharedStringFuzzFactory extends SharedStringFuzzFactory {
	public close(channel: OracleSharedString) {
		channel.oracle?.dispose();
	}
}

const oracleModel: typeof baseSharedStringModel = {
	...baseSharedStringModel,
	factory: new OracleSharedStringFuzzFactory(),
};

describe("SharedString oracle fuzz testing", () => {
	createDDSFuzzSuite(
		{ ...oracleModel, workloadName: "SharedString oracle" },
		{
			...defaultFuzzOptions,
			emitter,
		},
	);
});
