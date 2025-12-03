/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import {
	createWeightedAsyncGenerator,
	takeAsync,
	done,
} from "@fluid-private/stochastic-test-utils";
import {
	createSquashFuzzSuite,
	type DDSFuzzHarnessEvents,
	type SquashFuzzTestState,
} from "@fluid-private/test-dds-utils";
import {
	ReferenceType,
	type LocalReferencePosition,
} from "@fluidframework/merge-tree/internal";
import { segmentIsRemoved } from "@fluidframework/merge-tree/internal";

import type { SharedStringFactory } from "../../sequenceFactory.js";
import type { ISharedString } from "../../sharedString.js";

import {
	baseSharedStringModel,
	defaultFuzzOptions,
	defaultIntervalOperationGenerationConfig,
	makeSharedStringOperationGenerator,
	type AddPoisonedText,
	type Operation,
	type SharedStringOperationGenerationConfig,
} from "./fuzzUtils.js";

export type PoisonedSharedString = ISharedString & {
	poisonedHandleLocations: LocalReferencePosition[];
};

export function isPoisonedSharedString(s: ISharedString): s is PoisonedSharedString {
	return (
		(s as PoisonedSharedString).poisonedHandleLocations !== undefined &&
		Array.isArray((s as PoisonedSharedString).poisonedHandleLocations)
	);
}

type FuzzTestState = SquashFuzzTestState<SharedStringFactory>;

type SquashOperation = AddPoisonedText | Operation;

interface SquashOperationGenerationConfig extends SharedStringOperationGenerationConfig {
	weights: SharedStringOperationGenerationConfig["weights"] & {
		addPoisonedHandleText: number;
	};
}

const defaultSquashOperationGenerationConfig: SquashOperationGenerationConfig = {
	...defaultIntervalOperationGenerationConfig,
	weights: {
		...defaultIntervalOperationGenerationConfig.weights,
		addPoisonedHandleText: 1,
	},
};

function makeExitingStagingModeGenerator() {
	return (state: FuzzTestState): Operation | typeof done => {
		// Rather than generate a normal op, only generate ops which remove existing poisoned handles.
		const {
			client: { channel: sharedString },
		} = state;
		assert(isPoisonedSharedString(sharedString));
		const { poisonedHandleLocations } = sharedString;
		if (poisonedHandleLocations.length > 0) {
			const ref = poisonedHandleLocations[0];
			const segment = ref.getSegment();
			assert(
				segment !== undefined && !segmentIsRemoved(segment),
				"Expected poisoned handle to be on valid segment",
			);
			const pos = sharedString.localReferencePositionToPosition(ref);
			return {
				type: "removeRange",
				start: pos,
				end: pos + 1,
			};
		}

		return done;
	};
}

function makeSquashOperationGenerator(optionsParam?: SquashOperationGenerationConfig) {
	const baseGenerator = makeSharedStringOperationGenerator(optionsParam);

	async function addPoisonedHandleText(state: FuzzTestState): Promise<AddPoisonedText> {
		const { random, client } = state;
		return {
			type: "addPoisonedText",
			index: random.integer(0, client.channel.getLength()),
			content: random.string(1),
			properties: { poison: state.random.poisonedHandle() },
		};
	}

	const isInStagingMode = (state: FuzzTestState): boolean =>
		state.client.stagingModeStatus === "staging";

	const usableWeights =
		optionsParam?.weights ?? defaultSquashOperationGenerationConfig.weights;
	return createWeightedAsyncGenerator<SquashOperation, FuzzTestState>([
		[
			baseGenerator,
			usableWeights.addText +
				usableWeights.removeRange +
				usableWeights.obliterateRange +
				usableWeights.annotateRange,
		],
		[addPoisonedHandleText, usableWeights.addPoisonedHandleText, isInStagingMode],
	]);
}

function makeSquashReducer() {
	const baseFuzzReducer = baseSharedStringModel.reducer;
	return (state: FuzzTestState, op: SquashOperation): void => {
		if (op.type === "addPoisonedText") {
			const { client } = state;
			const { content, index, properties } = op;
			assert(isPoisonedSharedString(client.channel));
			assert(content.length === 1);
			client.channel.insertText(index, content, properties);
			const { segment, offset } = client.channel.getContainingSegment(index);
			assert(segment !== undefined && offset !== undefined);
			const ref = client.channel.createLocalReferencePosition(
				segment,
				offset,
				ReferenceType.Simple,
				undefined,
			);
			client.channel.poisonedHandleLocations.push(ref);
		} else {
			baseFuzzReducer(state, op);
		}

		if (state.client.stagingModeStatus !== "off") {
			// The above op may have removed content containing a poisoned handle. If so, remove local reference positions that track such content.
			const { channel: sharedString } = state.client;
			assert(isPoisonedSharedString(sharedString));
			const { poisonedHandleLocations } = sharedString;
			// A linked list may be better for the usage pattern for longer fuzz tests, but the one in merge-tree isn't exported currently and at
			// the scale we run our fuzz tests, an array should be fine.
			const removedPoisonedHandles = new Set<LocalReferencePosition>();
			for (const ref of poisonedHandleLocations) {
				const segment = ref.getSegment();
				// Note: once we support squashing property changes, we should record additional information in `poisonedHandleLocations` to know where we put
				// the handle, and check more than just if the segment has been removed (e.g. if we put the handle on the property "foo", we should read segment.properties.foo
				// to see if it's still there)
				if (segment !== undefined && segmentIsRemoved(segment)) {
					sharedString.removeLocalReferencePosition(ref);
					removedPoisonedHandles.add(ref);
				}
			}

			if (removedPoisonedHandles.size > 0) {
				sharedString.poisonedHandleLocations = sharedString.poisonedHandleLocations.filter(
					(ref) => !removedPoisonedHandles.has(ref),
				);
			}
		}
	};
}

const emitter = new TypedEventEmitter<DDSFuzzHarnessEvents>();

emitter.on("clientCreate", (client) => {
	const channel = client.channel as PoisonedSharedString;
	channel.poisonedHandleLocations = [];
});

describe("SharedString fuzz testing", () => {
	createSquashFuzzSuite(
		{
			...baseSharedStringModel,
			generatorFactory: () => takeAsync(100, makeSquashOperationGenerator()),
			exitingStagingModeGeneratorFactory: makeExitingStagingModeGenerator,
			reducer: makeSquashReducer(),
			workloadName: "squashing",
			minimizationTransforms: [
				// Apply all base transformations to op types we inherit from the base model
				...(baseSharedStringModel.minimizationTransforms?.map(
					(transform) => (op: SquashOperation) => {
						if (op.type !== "addPoisonedText") {
							transform(op);
						}
					},
				) ?? []),
				// ...and a simple one for poisoned handle ops.
				(op: SquashOperation) => {
					if (op.type === "addPoisonedText") {
						op.index--;
					}
				},
			],
			validatePoisonedContentRemoved: (client) => {
				assert(isPoisonedSharedString(client.channel));
				const { poisonedHandleLocations } = client.channel;
				if (poisonedHandleLocations.length > 0) {
					for (const handle of poisonedHandleLocations) {
						const segment = handle.getSegment();
						assert(
							segment === undefined || segmentIsRemoved(segment),
							"Content with poisoned handle not removed from shared string.",
						);
					}
				}
			},
		},
		{
			...defaultFuzzOptions,
			emitter,
			stagingMode: {
				changeStagingModeProbability: 0.1,
			},
			// Uncomment this line to replay a specific seed from its failure file:
			// replay: 0,
		},
	);
});
