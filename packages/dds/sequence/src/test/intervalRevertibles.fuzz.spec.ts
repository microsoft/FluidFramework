/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "path";
import { readdirSync } from "fs";
import { strict as assert } from "assert";
import {
	createWeightedAsyncGenerator as createWeightedGenerator,
	AsyncGenerator as Generator,
	takeAsync as take,
} from "@fluid-internal/stochastic-test-utils";
import {
	createDDSFuzzSuite,
	DDSFuzzModel,
	DDSFuzzHarnessEvents,
	DDSFuzzSuiteOptions,
} from "@fluid-internal/test-dds-utils";
import { TypedEventEmitter } from "@fluidframework/common-utils";
import {
	IFluidDataStoreRuntime,
	IChannelServices,
	IChannelAttributes,
} from "@fluidframework/datastore-definitions";
import { SharedStringFactory } from "../sequenceFactory";
import {
	appendAddIntervalToRevertibles,
	appendChangeIntervalToRevertibles,
	appendDeleteIntervalToRevertibles,
	appendIntervalPropertyChangedToRevertibles,
	appendSharedStringDeltaToRevertibles,
} from "../revertibles";
import { SharedString } from "../sharedString";
import { assertEquivalentSharedStrings } from "./intervalUtils";
import {
	Operation,
	FuzzTestState,
	RevertOperation,
	makeReducer,
	RevertibleSharedString,
	isRevertibleSharedString,
	OperationGenerationConfig,
	RevertSharedStringRevertibles,
	defaultOptions,
} from "./intervalCollection.fuzzUtils";
import { makeOperationGenerator } from "./intervalCollection.fuzz.spec";
import { minimizeTestFromFailureFile } from "./intervalCollection.fuzzMinimization";

// Since the clients are created by the fuzz harness, the factory object must be
// modified in order to set the mergeTreeUseNewLengthCalculations option on the
// underlying merge tree. This can be deleted after PR#15868 is in main.
class RevertibleFactory extends SharedStringFactory {
	options = { mergeTreeUseNewLengthCalculations: true };
	public async load(
		runtime: IFluidDataStoreRuntime,
		id: string,
		services: IChannelServices,
		attributes: IChannelAttributes,
	): Promise<SharedString> {
		runtime.options.mergeTreeUseNewLengthCalculations = true;
		return super.load(runtime, id, services, attributes);
	}

	public create(document: IFluidDataStoreRuntime, id: string): SharedString {
		document.options.mergeTreeUseNewLengthCalculations = true;
		return super.create(document, id);
	}
}

const emitter = new TypedEventEmitter<DDSFuzzHarnessEvents>();

emitter.on("clientCreate", (client) => {
	const channel = client.channel as RevertibleSharedString;
	channel.revertibles = [];

	channel.on("createIntervalCollection", (label) => {
		const collection = channel.getIntervalCollection(label);

		assert(isRevertibleSharedString(channel));
		collection.on("addInterval", (interval, local, op) => {
			if (local) {
				appendAddIntervalToRevertibles(interval, channel.revertibles);
			}
		});
		// Note: delete and change interval edits are disabled for now, and will be reenabled
		// once bugs AB#4544 and AB#4543 (respectively) are resolved.

		collection.on("deleteInterval", (interval, local, op) => {
			if (local) {
				appendDeleteIntervalToRevertibles(channel, interval, channel.revertibles);
			}
		});
		collection.on("changeInterval", (interval, previousInterval, local, op) => {
			if (local) {
				appendChangeIntervalToRevertibles(
					channel,
					interval,
					previousInterval,
					channel.revertibles,
				);
			}
		});
		collection.on("propertyChanged", (interval, propertyDeltas, local, op) => {
			if (local) {
				appendIntervalPropertyChangedToRevertibles(
					interval,
					propertyDeltas,
					channel.revertibles,
				);
			}
		});
		channel.on("sequenceDelta", (op) => {
			if (op.isLocal) {
				appendSharedStringDeltaToRevertibles(channel, op, channel.revertibles);
			}
		});
	});
});

const intervalTestOptions: Partial<DDSFuzzSuiteOptions> = {
	validationStrategy: { type: "fixedInterval", interval: 10 },
	reconnectProbability: 0.1,
	numberOfClients: 3,
	clientJoinOptions: {
		maxNumberOfClients: 6,
		clientAddProbability: 0.1,
	},
	defaultTestCount: 100,
	// Uncomment this line to replay a specific seed from its failure file:
	// replay: 0,
	saveFailures: { directory: path.join(__dirname, "../../src/test/results") },
	parseOperations: (serialized: string) => {
		const operations: Operation[] = JSON.parse(serialized);
		// Replace this value with some other interval ID and uncomment to filter replay of the test
		// suite to only include interval operations with this ID.
		// const filterIntervalId = "00000000-0000-0000-0000-000000000000";
		// if (filterIntervalId) {
		// 	return operations.filter((entry) =>
		// 		[undefined, filterIntervalId].includes((entry as any).id),
		// 	);
		// }
		return operations;
	},
};

const optionsWithEmitter: Partial<DDSFuzzSuiteOptions> = {
	...intervalTestOptions,
	emitter,
};

type ClientOpState = FuzzTestState;
function operationGenerator(
	optionsParam: OperationGenerationConfig,
): Generator<RevertOperation, ClientOpState> {
	async function revertSharedStringRevertibles(
		state: ClientOpState,
	): Promise<RevertSharedStringRevertibles> {
		assert(isRevertibleSharedString(state.channel));
		return {
			type: "revertSharedStringRevertibles",
			// grab a random number of edits to revert
			editsToRevert: state.random.integer(0, state.channel.revertibles.length + 1),
		};
	}

	const hasRevertibles = ({ channel }: ClientOpState): boolean => {
		assert(isRevertibleSharedString(channel));
		return channel.revertibles.length > 0;
	};
	assert(optionsParam.weights !== undefined);
	const baseGenerator = makeOperationGenerator(optionsParam.weights);
	return createWeightedGenerator<RevertOperation, ClientOpState>([
		[revertSharedStringRevertibles, optionsParam.weights.revertWeight, hasRevertibles],
		[baseGenerator, 1],
	]);
}

describe.only("IntervalCollection fuzz testing", () => {
	const model: DDSFuzzModel<RevertibleFactory, RevertOperation, FuzzTestState> = {
		workloadName: "interval collection with revertibles",
		generatorFactory: () => take(100, operationGenerator(defaultOptions)),
		reducer:
			// makeReducer supports a param for logging output which tracks the provided intervalId over time:
			// { intervalId: "00000000-0000-0000-0000-000000000000", clientIds: ["A", "B", "C"] }
			makeReducer(),
		validateConsistency: assertEquivalentSharedStrings,
		factory: new RevertibleFactory(),
	};

	createDDSFuzzSuite(model, optionsWithEmitter);
});

describe.skip("minimize specific seed", () => {
	const seedToMinimize = 0;
	minimizeTestFromFailureFile(seedToMinimize);
});

describe.skip("minimize all seeds", () => {
	let files;
	try {
		files = readdirSync("./results");
	} catch {
		return;
	}

	for (const file of files) {
		const seedToMinimize = parseInt(file.substring(0, file.length - ".json".length), 10);
		minimizeTestFromFailureFile(seedToMinimize);
	}
});
