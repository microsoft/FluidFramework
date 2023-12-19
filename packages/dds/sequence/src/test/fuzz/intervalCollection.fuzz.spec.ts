/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	AcceptanceCondition,
	createWeightedAsyncGenerator as createWeightedGenerator,
	AsyncGenerator as Generator,
	takeAsync as take,
} from "@fluid-private/stochastic-test-utils";
import { createDDSFuzzSuite } from "@fluid-private/test-dds-utils";
import { PropertySet } from "@fluidframework/merge-tree";
import { FlushMode } from "@fluidframework/runtime-definitions";
import { IIntervalCollection, Side } from "../../intervalCollection";
import { SequenceInterval } from "../../intervals";
import {
	Operation,
	RangeSpec,
	AddInterval,
	DeleteInterval,
	ChangeInterval,
	FuzzTestState,
	IntervalOperationGenerationConfig,
	defaultIntervalOperationGenerationConfig,
	createSharedStringGeneratorOperations,
	baseModel,
	defaultFuzzOptions,
} from "./fuzzUtils";

type ClientOpState = FuzzTestState;
export function makeOperationGenerator(
	optionsParam?: IntervalOperationGenerationConfig,
	alwaysLeaveChar: boolean = false,
): Generator<Operation, ClientOpState> {
	const {
		startPosition,
		addText,
		obliterateRange,
		removeRange,
		removeRangeLeaveChar,
		lengthSatisfies,
		hasNonzeroLength,
		isShorterThanMaxLength,
	} = createSharedStringGeneratorOperations(optionsParam);

	const options = { ...defaultIntervalOperationGenerationConfig, ...(optionsParam ?? {}) };

	function isNonEmpty(collection: IIntervalCollection<SequenceInterval>): boolean {
		for (const _ of collection) {
			return true;
		}

		return false;
	}

	function inclusiveRange(state: ClientOpState): RangeSpec {
		const start = startPosition(state);
		const end = state.random.integer(
			start,
			Math.max(start, state.client.channel.getLength() - 1),
		);
		return { start, end };
	}

	function inclusiveRangeWithUndefined(
		state: ClientOpState,
	): RangeSpec | { start: undefined; end: undefined } {
		return state.random.bool() ? inclusiveRange(state) : { start: undefined, end: undefined };
	}

	function propertySet(state: ClientOpState): PropertySet {
		const propNamesShuffled = [...options.propertyNamePool];
		state.random.shuffle(propNamesShuffled);
		const propsToChange = propNamesShuffled.slice(
			0,
			state.random.integer(1, propNamesShuffled.length),
		);
		const propSet: PropertySet = {};
		for (const name of propsToChange) {
			propSet[name] = state.random.string(5);
		}
		return propSet;
	}

	function propertySetWithUndefined(state: ClientOpState): PropertySet | undefined {
		return state.random.bool() ? propertySet(state) : undefined;
	}

	function nonEmptyIntervalCollection({ client, random }: ClientOpState): string {
		const nonEmptyLabels = Array.from(client.channel.getIntervalCollectionLabels()).filter(
			(label) => {
				const collection = client.channel.getIntervalCollection(label);
				return isNonEmpty(collection);
			},
		);
		return random.pick(nonEmptyLabels);
	}

	function interval(state: ClientOpState): { collectionName: string; id: string } {
		const collectionName = nonEmptyIntervalCollection(state);
		const intervals = Array.from(state.client.channel.getIntervalCollection(collectionName));
		const id = state.random.pick(intervals)?.getIntervalId();
		assert(id);

		return {
			id,
			collectionName,
		};
	}

	async function addInterval(state: ClientOpState): Promise<AddInterval> {
		return {
			type: "addInterval",
			...inclusiveRange(state),
			collectionName: state.random.pick(options.intervalCollectionNamePool),
			id: state.random.uuid4(),
			startSide: state.random.pick([Side.Before, Side.After]),
			endSide: state.random.pick([Side.Before, Side.After]),
		};
	}

	async function deleteInterval(state: ClientOpState): Promise<DeleteInterval> {
		return {
			type: "deleteInterval",
			...interval(state),
		};
	}

	async function changeInterval(state: ClientOpState): Promise<ChangeInterval> {
		const { start, end } = inclusiveRangeWithUndefined(state);
		const properties = propertySetWithUndefined(state);
		return {
			type: "changeInterval",
			start,
			end,
			startSide: state.random.pick([Side.Before, Side.After]),
			endSide: state.random.pick([Side.Before, Side.After]),
			properties,
			...interval(state),
		};
	}

	const hasAnInterval = ({ client }: ClientOpState): boolean =>
		Array.from(client.channel.getIntervalCollectionLabels()).some((label) => {
			const collection = client.channel.getIntervalCollection(label);
			return isNonEmpty(collection);
		});

	const hasNotTooManyIntervals: AcceptanceCondition<ClientOpState> = ({ client }) => {
		let intervalCount = 0;
		for (const label of client.channel.getIntervalCollectionLabels()) {
			for (const _ of client.channel.getIntervalCollection(label)) {
				intervalCount++;
				if (intervalCount >= options.maxIntervals) {
					return false;
				}
			}
		}
		return true;
	};

	const all =
		<T>(...clauses: AcceptanceCondition<T>[]): AcceptanceCondition<T> =>
		(t: T) =>
			clauses.reduce<boolean>((prev, cond) => prev && cond(t), true);
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
		[obliterateRange, usableWeights.obliterateRange, hasNonzeroLength],
		[addInterval, usableWeights.addInterval, all(hasNotTooManyIntervals, hasNonzeroLength)],
		[deleteInterval, usableWeights.deleteInterval, hasAnInterval],
		[changeInterval, usableWeights.changeInterval, all(hasAnInterval, hasNonzeroLength)],
	]);
}

const baseIntervalModel = {
	...baseModel,
	generatorFactory: () =>
		take(100, makeOperationGenerator(defaultIntervalOperationGenerationConfig)),
};

describe("IntervalCollection fuzz testing", () => {
	const model = {
		...baseIntervalModel,
		workloadName: "default interval collection",
	};

	createDDSFuzzSuite(model, {
		...defaultFuzzOptions,
		// AB#4477: Seed 20, 60 and others with its call stack is the same root cause as skipped regression test in
		// intervalCollection.spec.ts--search for 4477.
		// AB#6552: Seeds 9 and 70 exposed a bug where the interval endpoints do not slide properly on shared string removeRange.
		// The other failing seeds were added when the mocks were changed to properly update msn on reconnects.
		// This exposed ways that `0x54e` can occur.
		// The root cause of this bug is--roughly speaking--interval endpoints with StayOnRemove being placed
		// on segments that can be zamboni'd.
		// TODO:AB#5337: re-enable these seeds.
		skip: [
			1, 2, 5, 6, 9, 14, 16, 18, 21, 24, 25, 26, 28, 31, 32, 33, 35, 36, 37, 44, 47, 51, 54,
			59, 62, 64, 65, 66, 68, 70, 73, 78, 79, 81, 88, 89, 92, 93, 95, 96, 97,
		],
		// Uncomment this line to replay a specific seed from its failure file:
		// replay: 0,
	});
});

describe("IntervalCollection no reconnect fuzz testing", () => {
	const noReconnectModel = {
		...baseIntervalModel,
		workloadName: "interval collection without reconnects",
	};

	const options = {
		...defaultFuzzOptions,
		// AB#4477: Same root cause as skipped regression test in intervalCollection.spec.ts--search for 4477
		skip: [88],
		reconnectProbability: 0.0,
		clientJoinOptions: {
			maxNumberOfClients: 3,
			clientAddProbability: 0.0,
		},
	};

	createDDSFuzzSuite(noReconnectModel, {
		...options,
		// Uncomment this line to replay a specific seed from its failure file:
		// replay: 0,
	});
});

describe("IntervalCollection fuzz testing with rebased batches", () => {
	const noReconnectWithRebaseModel = {
		...baseIntervalModel,
		workloadName: "interval collection with rebasing",
	};

	createDDSFuzzSuite(noReconnectWithRebaseModel, {
		...defaultFuzzOptions,
		// AB#4477: Either the same root cause as skipped regression test in intervalCollection.spec.ts--search for 4477,
		// or 0x54e, see AB#5337 or comment on "default interval collection" fuzz suite.
		skip: [1, 5, 10, 11, 16, 19, 25, 27, 28, 32, 33, 39, 43, 52, 54, 57, 71, 86, 93],
		reconnectProbability: 0.0,
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
