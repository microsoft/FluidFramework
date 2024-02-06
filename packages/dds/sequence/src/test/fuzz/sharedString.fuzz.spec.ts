/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	createWeightedAsyncGenerator as createWeightedGenerator,
	AsyncGenerator as Generator,
	takeAsync as take,
} from "@fluid-private/stochastic-test-utils";
import { createDDSFuzzSuite } from "@fluid-private/test-dds-utils";
import { FlushMode } from "@fluidframework/runtime-definitions";
import {
	Operation,
	FuzzTestState,
	defaultIntervalOperationGenerationConfig,
	createSharedStringGeneratorOperations,
	SharedStringOperationGenerationConfig,
	baseModel,
	defaultFuzzOptions,
} from "./fuzzUtils";

type ClientOpState = FuzzTestState;
export function makeSharedStringOperationGenerator(
	optionsParam?: SharedStringOperationGenerationConfig,
	alwaysLeaveChar: boolean = false,
): Generator<Operation, ClientOpState> {
	const {
		addText,
		removeRange,
		removeRangeLeaveChar,
		lengthSatisfies,
		hasNonzeroLength,
		isShorterThanMaxLength,
	} = createSharedStringGeneratorOperations(optionsParam);

	const usableWeights = optionsParam?.weights ?? defaultIntervalOperationGenerationConfig.weights;
	return createWeightedGenerator<Operation, ClientOpState>([
		[addText, usableWeights.addText, isShorterThanMaxLength],
		[
			alwaysLeaveChar ? removeRangeLeaveChar : removeRange,
			usableWeights.removeRange,
			alwaysLeaveChar
				? lengthSatisfies((length) => {
						return length > 1;
				  })
				: hasNonzeroLength,
		],
	]);
}

const baseSharedStringModel = {
	...baseModel,
	generatorFactory: () =>
		take(100, makeSharedStringOperationGenerator(defaultIntervalOperationGenerationConfig)),
};

describe("SharedString no reconnect fuzz testing", () => {
	const noReconnectNoIntervalsModel = {
		...baseSharedStringModel,
		workloadName: "SharedString without reconnects",
		generatorFactory: () =>
			take(
				100,
				makeSharedStringOperationGenerator({
					...defaultIntervalOperationGenerationConfig,
				}),
			),
	};

	createDDSFuzzSuite(noReconnectNoIntervalsModel, {
		...defaultFuzzOptions,
		reconnectProbability: 0.0,
		clientJoinOptions: {
			maxNumberOfClients: 3,
			clientAddProbability: 0.0,
		},
		// Uncomment this line to replay a specific seed from its failure file:
		// replay: 0,
	});
});

describe("SharedString fuzz testing with rebased batches", () => {
	const noReconnectWithRebaseModel = {
		...baseSharedStringModel,
		workloadName: "SharedString with rebasing",
	};

	createDDSFuzzSuite(noReconnectWithRebaseModel, {
		...defaultFuzzOptions,
		reconnectProbability: 0.0,
		numberOfClients: 3,
		clientJoinOptions: {
			maxNumberOfClients: 3,
			clientAddProbability: 0.0,
		},
		rebaseProbability: 0.2,
		containerRuntimeOptions: {
			flushMode: FlushMode.TurnBased,
			enableGroupedBatching: true,
		},
		// Uncomment this line to replay a specific seed from its failure file:
		// replay: 0,
	});
});

// todo: potentially related to AB#7050
//
// `intervalRebasing.spec.ts` contains some reduced tests exhibiting the crashes
// linked to AB#7050
describe.skip("SharedString fuzz testing with rebased batches and reconnect", () => {
	const noReconnectWithRebaseModel = {
		...baseSharedStringModel,
		workloadName: "SharedString with rebasing and reconnect",
	};

	createDDSFuzzSuite(noReconnectWithRebaseModel, {
		...defaultFuzzOptions,
		reconnectProbability: 0.3,
		numberOfClients: 3,
		clientJoinOptions: {
			maxNumberOfClients: 3,
			clientAddProbability: 0.0,
		},
		rebaseProbability: 0.2,
		containerRuntimeOptions: {
			flushMode: FlushMode.TurnBased,
			enableGroupedBatching: true,
		},
		// Uncomment this line to replay a specific seed from its failure file:
		// replay: 0,
	});
});
