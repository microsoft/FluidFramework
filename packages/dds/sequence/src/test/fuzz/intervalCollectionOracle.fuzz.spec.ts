/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import { type DDSFuzzHarnessEvents } from "@fluid-private/test-dds-utils";

import type { IntervalCollection } from "../../intervalCollection.js";
import { IntervalCollectionOracle } from "../../intervalCollectionOracle.js";
import type { SharedString } from "../../sequenceFactory.js";
import type { ISharedString } from "../../sharedString.js";

import {
	// baseSharedStringModel,
	// defaultFuzzOptions,
	SharedStringFuzzFactory,
} from "./fuzzUtils.js";

const emitter = new TypedEventEmitter<DDSFuzzHarnessEvents>();

// WeakMap to track oracles for each channel
const oracleMap = new WeakMap<ISharedString, IntervalCollectionOracle>();

emitter.on("clientCreate", (client) => {
	const channel = client.channel as SharedString; // ISharedString
	const collection = channel.getIntervalCollection("default"); // now exists
	const oracle = new IntervalCollectionOracle(collection);

	oracleMap.set(channel, oracle);
});

export interface OracleIntervalCollection {
	collection: IntervalCollection; // or RevertibleSharedString’s interval collection
	oracle: IntervalCollectionOracle;
}

export function hasOracle(obj: any): obj is OracleIntervalCollection {
	// eslint-disable-next-line @typescript-eslint/no-unsafe-return
	return obj && obj.oracle !== undefined;
}

export class OracleIntervalCollectionFuzzFactory extends SharedStringFuzzFactory {
	public close(channel: OracleIntervalCollection) {
		channel.oracle?.dispose();
	}
}

// const oracleModel: typeof baseSharedStringModel = {
// 	...baseSharedStringModel,
// 	factory: new OracleIntervalCollectionFuzzFactory(),
// };

// describe("IntervalCollection oracle fuzz testing", () => {
// 	createDDSFuzzSuite(
// 		{ ...oracleModel, workloadName: "IntervalCollection oracle" },
// 		{
// 			...defaultFuzzOptions,
// 			emitter,
// 		},
// 	);
// });
