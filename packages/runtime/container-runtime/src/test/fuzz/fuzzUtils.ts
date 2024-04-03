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

import type { SummarizerFuzzModel, SummarizerFuzzTestState } from "./summarizerFuzzSuite.js";

interface Reconnect {
	type: "reconnect";
}

interface NewSummarizer {
	type: "newSummarizer";
}

interface SummaryNack {
	type: "summaryNack";
}

interface SubmitOp {
	type: "submitOp";
}

export type SummarizerOperation = Reconnect | NewSummarizer | SummaryNack | SubmitOp;

export interface ISummarizerOperationGenerationConfig {
	weights?: {
		reconnect: number;
		newSummarizer: number;
		summaryNack: number;
		submitOp: number;
	};
}

const defaultConfig: Required<ISummarizerOperationGenerationConfig> = {
	weights: {
		reconnect: 1,
		newSummarizer: 1,
		summaryNack: 1,
		submitOp: 1,
	},
};

export function summarizerOperationGenerator(
	options: ISummarizerOperationGenerationConfig,
): AsyncGenerator<SummarizerOperation, SummarizerFuzzTestState> {
	const reconnect = async (_state: SummarizerFuzzTestState): Promise<Reconnect> => ({
		type: "reconnect",
	});

	const newSummarizer = async (_state: SummarizerFuzzTestState): Promise<NewSummarizer> => ({
		type: "newSummarizer",
	});

	const summaryNack = async (_state: SummarizerFuzzTestState): Promise<SummaryNack> => ({
		type: "summaryNack",
	});

	const submitOp = async (_state: SummarizerFuzzTestState): Promise<SubmitOp> => ({
		type: "submitOp",
	});

	const usableWeights = options.weights ?? defaultConfig.weights;

	return createWeightedAsyncGenerator<SummarizerOperation, SummarizerFuzzTestState>([
		[reconnect, usableWeights.reconnect],
		[newSummarizer, usableWeights.newSummarizer],
		[summaryNack, usableWeights.summaryNack],
		[submitOp, usableWeights.submitOp],
	]);
}

export const baseModel: Omit<SummarizerFuzzModel, "workloadName" | "generatorFactory"> = {
	reducer: makeReducer(),
};

function makeReducer(): AsyncReducer<SummarizerOperation, SummarizerFuzzTestState> {
	const wrapper =
		<T>(
			baseReducer: AsyncReducer<T, SummarizerFuzzTestState>,
		): AsyncReducer<T, SummarizerFuzzTestState> =>
		async (state, operation) => {
			await baseReducer(state, operation);
			state.containerRuntimeFactory.processAllMessages();
		};

	const createNewSummarizer = async (state: SummarizerFuzzTestState) => {
		const oldRuntime = state.containerRuntime;
		oldRuntime.disposeFn();
		state.containerRuntime = state.containerRuntimeFactory.createContainerRuntime(
			new MockFluidDataStoreRuntime(),
		);
		await state.containerRuntime.initializeWithStashedOps(oldRuntime);
	};

	const reducer = combineReducersAsync<SummarizerOperation, SummarizerFuzzTestState>({
		reconnect: async (state: SummarizerFuzzTestState, _op: Reconnect) => {
			state.containerRuntime.connected = false;
			state.containerRuntime.connected = true;
			await createNewSummarizer(state);
		},
		newSummarizer: async (state: SummarizerFuzzTestState, _op: NewSummarizer) => {
			await createNewSummarizer(state);
		},
		summaryNack: async (state: SummarizerFuzzTestState, _op: SummaryNack) => {
			state.containerRuntime.prepareSummaryNack();
			await state.containerRuntime.summarize();
		},
		submitOp: async (state: SummarizerFuzzTestState, _op: SubmitOp) => {
			// Send arbitrary runtime op
			state.containerRuntime.submit({}, {});
		},
	});

	return wrapper(reducer);
}
