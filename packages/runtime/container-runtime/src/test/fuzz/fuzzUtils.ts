/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	AsyncGenerator,
	AsyncReducer,
	combineReducersAsync,
	createWeightedAsyncGenerator,
} from "@fluid-private/stochastic-test-utils";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils/internal";

// eslint-disable-next-line import/no-deprecated
import type { SummarizerFuzzModel, SummarizerFuzzTestState } from "./summarizerFuzzSuite.js";

interface Reconnect {
	type: "reconnect";
}

// eslint-disable-next-line import/no-deprecated
interface NewSummarizer {
	// eslint-disable-next-line import/no-deprecated
	type: "newSummarizer";
}

interface SummaryNack {
	type: "summaryNack";
}

interface SubmitOp {
	type: "submitOp";
}

// eslint-disable-next-line import/no-deprecated
export type SummarizerOperation = Reconnect | NewSummarizer | SummaryNack | SubmitOp;

// eslint-disable-next-line import/no-deprecated
export interface ISummarizerOperationGenerationConfig {
	weights?: {
		reconnect: number;
		// eslint-disable-next-line import/no-deprecated
		newSummarizer: number;
		summaryNack: number;
		submitOp: number;
	};
}

// eslint-disable-next-line import/no-deprecated
const defaultConfig: Required<ISummarizerOperationGenerationConfig> = {
	weights: {
		reconnect: 1,
		// eslint-disable-next-line import/no-deprecated
		newSummarizer: 1,
		summaryNack: 1,
		submitOp: 1,
	},
};

export function summarizerOperationGenerator(
	// eslint-disable-next-line import/no-deprecated
	options: ISummarizerOperationGenerationConfig,
	// eslint-disable-next-line import/no-deprecated
): AsyncGenerator<SummarizerOperation, SummarizerFuzzTestState> {
	// eslint-disable-next-line import/no-deprecated
	const reconnect = async (_state: SummarizerFuzzTestState): Promise<Reconnect> => ({
		type: "reconnect",
	});

	// eslint-disable-next-line import/no-deprecated
	const newSummarizer = async (_state: SummarizerFuzzTestState): Promise<NewSummarizer> => ({
		// eslint-disable-next-line import/no-deprecated
		type: "newSummarizer",
	});

	// eslint-disable-next-line import/no-deprecated
	const summaryNack = async (_state: SummarizerFuzzTestState): Promise<SummaryNack> => ({
		type: "summaryNack",
	});

	// eslint-disable-next-line import/no-deprecated
	const submitOp = async (_state: SummarizerFuzzTestState): Promise<SubmitOp> => ({
		type: "submitOp",
	});

	const usableWeights = options.weights ?? defaultConfig.weights;

	// eslint-disable-next-line import/no-deprecated
	return createWeightedAsyncGenerator<SummarizerOperation, SummarizerFuzzTestState>([
		[reconnect, usableWeights.reconnect],
		// eslint-disable-next-line import/no-deprecated
		[newSummarizer, usableWeights.newSummarizer],
		[summaryNack, usableWeights.summaryNack],
		[submitOp, usableWeights.submitOp],
	]);
}

// eslint-disable-next-line import/no-deprecated
export const baseModel: Omit<SummarizerFuzzModel, "workloadName" | "generatorFactory"> = {
	reducer: makeReducer(),
};

// eslint-disable-next-line import/no-deprecated
function makeReducer(): AsyncReducer<SummarizerOperation, SummarizerFuzzTestState> {
	const wrapper =
		<T>(
			// eslint-disable-next-line import/no-deprecated
			baseReducer: AsyncReducer<T, SummarizerFuzzTestState>,
			// eslint-disable-next-line import/no-deprecated
		): AsyncReducer<T, SummarizerFuzzTestState> =>
		async (state, operation) => {
			await baseReducer(state, operation);
			state.containerRuntimeFactory.processAllMessages();
		};

	// eslint-disable-next-line import/no-deprecated
	const createNewSummarizer = async (state: SummarizerFuzzTestState) => {
		const oldRuntime = state.containerRuntime;
		oldRuntime.disposeFn();
		state.containerRuntime = state.containerRuntimeFactory.createContainerRuntime(
			new MockFluidDataStoreRuntime(),
		);
		await state.containerRuntime.initializeWithStashedOps(oldRuntime);
	};

	// eslint-disable-next-line import/no-deprecated
	const reducer = combineReducersAsync<SummarizerOperation, SummarizerFuzzTestState>({
		// eslint-disable-next-line import/no-deprecated
		reconnect: async (state: SummarizerFuzzTestState, _op: Reconnect) => {
			state.containerRuntime.connected = false;
			state.containerRuntime.connected = true;
			// eslint-disable-next-line import/no-deprecated
			await createNewSummarizer(state);
		},
		// eslint-disable-next-line import/no-deprecated
		newSummarizer: async (state: SummarizerFuzzTestState, _op: NewSummarizer) => {
			// eslint-disable-next-line import/no-deprecated
			await createNewSummarizer(state);
		},
		// eslint-disable-next-line import/no-deprecated
		summaryNack: async (state: SummarizerFuzzTestState, _op: SummaryNack) => {
			state.containerRuntime.prepareSummaryNack();
			await state.containerRuntime.summarize();
		},
		// eslint-disable-next-line import/no-deprecated
		submitOp: async (state: SummarizerFuzzTestState, _op: SubmitOp) => {
			// Send arbitrary runtime op
			state.containerRuntime.submit({}, {});
		},
	});

	return wrapper(reducer);
}
