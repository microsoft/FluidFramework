/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { createEmitter } from "@fluid-internal/client-utils";
import {
	AsyncGenerator as Generator,
	createWeightedAsyncGenerator as createWeightedGenerator,
	takeAsync as take,
} from "@fluid-private/stochastic-test-utils";
import {
	DDSFuzzHarnessEvents,
	DDSFuzzModel,
	DDSFuzzSuiteOptions,
	createDDSFuzzSuite,
} from "@fluid-private/test-dds-utils";
import { FlushMode } from "@fluidframework/runtime-definitions/internal";

import {
	appendAddIntervalToRevertibles,
	appendChangeIntervalToRevertibles,
	appendDeleteIntervalToRevertibles,
	appendIntervalPropertyChangedToRevertibles,
	appendSharedStringDeltaToRevertibles,
} from "../../revertibles.js";

import {
	FuzzTestState,
	IntervalOperationGenerationConfig,
	RevertOperation,
	RevertSharedStringRevertibles,
	RevertibleSharedString,
	SharedStringFuzzFactory,
	baseModel,
	defaultFuzzOptions,
	isRevertibleSharedString,
	makeIntervalOperationGenerator,
} from "./fuzzUtils.js";

const emitter = createEmitter<DDSFuzzHarnessEvents>();

emitter.on("clientCreate", (client) => {
	const channel = client.channel as RevertibleSharedString;
	channel.revertibles = [];
	channel.isCurrentRevert = false;

	channel.on("createIntervalCollection", (label) => {
		const collection = channel.getIntervalCollection(label);

		assert(isRevertibleSharedString(channel));
		collection.on("addInterval", (interval, local, op) => {
			if (local && !channel.isCurrentRevert) {
				appendAddIntervalToRevertibles(interval, channel.revertibles);
			}
		});
		collection.on("deleteInterval", (interval, local, op) => {
			if (local && !channel.isCurrentRevert) {
				appendDeleteIntervalToRevertibles(channel, interval, channel.revertibles);
			}
		});
		collection.on("changeInterval", (interval, previousInterval, local, op, slide) => {
			if (local && !channel.isCurrentRevert && !slide) {
				appendChangeIntervalToRevertibles(
					channel,
					interval,
					previousInterval,
					channel.revertibles,
				);
			}
		});
		collection.on("propertyChanged", (interval, propertyDeltas, local, op) => {
			if (local && !channel.isCurrentRevert) {
				appendIntervalPropertyChangedToRevertibles(
					interval,
					propertyDeltas,
					channel.revertibles,
				);
			}
		});
		channel.on("sequenceDelta", (op) => {
			if (op.isLocal && !channel.isCurrentRevert) {
				appendSharedStringDeltaToRevertibles(channel, op, channel.revertibles);
			}
		});
	});
});

const defaultRevertiblesFuzzOptions: Partial<DDSFuzzSuiteOptions> = {
	...defaultFuzzOptions,
	reconnectProbability: 0,
	clientJoinOptions: {
		maxNumberOfClients: 6,
		clientAddProbability: 0,
	},
};

const optionsWithEmitter: Partial<DDSFuzzSuiteOptions> = {
	...defaultRevertiblesFuzzOptions,
	emitter,
};

type ClientOpState = FuzzTestState;
function operationGenerator(
	optionsParam: IntervalOperationGenerationConfig,
): Generator<RevertOperation, ClientOpState> {
	async function revertSharedStringRevertibles(
		state: ClientOpState,
	): Promise<RevertSharedStringRevertibles> {
		assert(isRevertibleSharedString(state.client.channel));
		return {
			type: "revertSharedStringRevertibles",
			// grab a random number of edits to revert
			editsToRevert: state.random.integer(1, state.client.channel.revertibles.length),
		};
	}

	const hasRevertibles = ({ client }: ClientOpState): boolean => {
		assert(isRevertibleSharedString(client.channel));
		return client.channel.revertibles.length > 0;
	};

	assert(optionsParam.weights !== undefined);
	const baseGenerator = makeIntervalOperationGenerator(optionsParam, true);
	return createWeightedGenerator<RevertOperation, ClientOpState>([
		[revertSharedStringRevertibles, optionsParam.weights.revertWeight, hasRevertibles],
		[baseGenerator, 1],
	]);
}

describe("IntervalCollection fuzz testing", () => {
	const model: DDSFuzzModel<SharedStringFuzzFactory, RevertOperation, FuzzTestState> = {
		...baseModel,
		workloadName: "interval collection with revertibles",
		generatorFactory: () =>
			take(
				100,
				// Weights are explicitly defined here while bugs are being resolved. Once resolved,
				// the weights in the defaultOptions parameter will be used.
				operationGenerator({
					weights: {
						revertWeight: 2,
						addText: 2,
						removeRange: 1,
						annotateRange: 1,
						obliterateRange: 0,
						addInterval: 2,
						deleteInterval: 2,
						changeInterval: 2,
					},
				}),
			),
	};

	createDDSFuzzSuite(model, optionsWithEmitter);
});

describe("IntervalCollection fuzz testing with rebasing", () => {
	const model: DDSFuzzModel<SharedStringFuzzFactory, RevertOperation, FuzzTestState> = {
		...baseModel,
		workloadName: "interval collection with revertibles and rebasing",
		generatorFactory: () =>
			take(
				100,
				// Weights are explicitly defined here while bugs are being resolved. Once resolved,
				// the weights in the defaultOptions parameter will be used.
				operationGenerator({
					weights: {
						revertWeight: 2,
						addText: 2,
						removeRange: 1,
						annotateRange: 1,
						obliterateRange: 0,
						addInterval: 2,
						deleteInterval: 2,
						changeInterval: 2,
					},
				}),
			),
	};

	createDDSFuzzSuite(model, {
		...optionsWithEmitter,
		rebaseProbability: 0.15,
		containerRuntimeOptions: {
			flushMode: FlushMode.TurnBased,
			enableGroupedBatching: true,
		},
	});
});
