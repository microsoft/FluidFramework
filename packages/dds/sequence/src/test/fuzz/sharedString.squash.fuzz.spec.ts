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

function makeExitingStagingModeGenerator() {
	return (state: FuzzTestState): Operation | typeof done => {
		// Rather than generate a normal op, only generate ops which remove existing poisoned handles.
		const {
			client: { channel: sharedString },
		} = state;
		assert(isPoisonedSharedString(sharedString));
		const { poisonedHandleLocations } = sharedString;
		// Mutating in the generator like this is not great practice, but it avoids having to define a special op type for 'removing poisoned content'
		// which also handles removing values from `poisonedHandleLocations`.
		// If debugging a situation where this test has strange behavior, consider adding that separate op type instead.
		while (poisonedHandleLocations.length > 0) {
			// safe due to length check above
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const lastPoisonedHandleLocation = poisonedHandleLocations.pop()!;
			const pos = sharedString.localReferencePositionToPosition(lastPoisonedHandleLocation);
			const segment = lastPoisonedHandleLocation.getSegment();
			sharedString.removeLocalReferencePosition(lastPoisonedHandleLocation);
			if (segment !== undefined && !segmentIsRemoved(segment)) {
				return {
					type: "removeRange",
					start: pos,
					end: pos + 1,
				};
			}
		}

		return done;
	};
}

function makeSquashOperationGenerator(optionsParam?: SharedStringOperationGenerationConfig) {
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
		optionsParam?.weights ?? defaultIntervalOperationGenerationConfig.weights;
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
				ReferenceType.Simple /* so that it detaches on remove */,
				undefined,
			);
			client.channel.poisonedHandleLocations.push(ref);
		} else {
			baseFuzzReducer(state, op);
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
			workloadName: "SharedString squashing",
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
