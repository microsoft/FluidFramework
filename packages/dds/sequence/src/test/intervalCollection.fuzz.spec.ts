/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "path";
import { readdirSync } from "fs";
import { strict as assert } from "assert";
import {
	AcceptanceCondition,
	createWeightedAsyncGenerator as createWeightedGenerator,
	AsyncGenerator as Generator,
	takeAsync as take,
} from "@fluid-internal/stochastic-test-utils";
import {
	createDDSFuzzSuite,
	DDSFuzzModel,
	DDSFuzzSuiteOptions,
} from "@fluid-internal/test-dds-utils";
import { PropertySet } from "@fluidframework/merge-tree";
import { FlushMode } from "@fluidframework/runtime-definitions";
import { IIntervalCollection } from "../intervalCollection";
import { SharedStringFactory } from "../sequenceFactory";
import { IntervalStickiness, SequenceInterval } from "../intervals";
import { assertEquivalentSharedStrings } from "./intervalUtils";
import {
	Operation,
	RangeSpec,
	AddInterval,
	DeleteInterval,
	ChangeInterval,
	ChangeProperties,
	FuzzTestState,
	makeReducer,
	IntervalOperationGenerationConfig,
	defaultIntervalOperationGenerationConfig,
	createSharedStringGeneratorOperations,
} from "./intervalCollection.fuzzUtils";
import { minimizeTestFromFailureFile } from "./intervalCollection.fuzzMinimization";

type ClientOpState = FuzzTestState;
export function makeOperationGenerator(
	optionsParam?: IntervalOperationGenerationConfig,
	alwaysLeaveChar: boolean = false,
): Generator<Operation, ClientOpState> {
	const {
		startPosition,
		addText,
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
		const end = state.random.integer(start, Math.max(start, state.channel.getLength() - 1));
		return { start, end };
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

	function nonEmptyIntervalCollection({ channel, random }: ClientOpState): string {
		const nonEmptyLabels = Array.from(channel.getIntervalCollectionLabels()).filter((label) => {
			const collection = channel.getIntervalCollection(label);
			return isNonEmpty(collection);
		});
		return random.pick(nonEmptyLabels);
	}

	function interval(state: ClientOpState): { collectionName: string; id: string } {
		const collectionName = nonEmptyIntervalCollection(state);
		const intervals = Array.from(state.channel.getIntervalCollection(collectionName));
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
			stickiness: state.random.pick(
				Object.values(IntervalStickiness) as IntervalStickiness[],
			),
		};
	}

	async function deleteInterval(state: ClientOpState): Promise<DeleteInterval> {
		return {
			type: "deleteInterval",
			...interval(state),
		};
	}

	async function changeInterval(state: ClientOpState): Promise<ChangeInterval> {
		const { start, end } = inclusiveRange(state);
		return {
			type: "changeInterval",
			start: state.random.integer(0, 5) === 5 ? undefined : start,
			end: state.random.integer(0, 5) === 5 ? undefined : end,
			...interval(state),
		};
	}

	async function changeProperties(state: ClientOpState): Promise<ChangeProperties> {
		return {
			type: "changeProperties",
			...interval(state),
			properties: propertySet(state),
		};
	}

	const hasAnInterval = ({ channel }: ClientOpState): boolean =>
		Array.from(channel.getIntervalCollectionLabels()).some((label) => {
			const collection = channel.getIntervalCollection(label);
			return isNonEmpty(collection);
		});

	const hasNotTooManyIntervals: AcceptanceCondition<ClientOpState> = ({ channel }) => {
		let intervalCount = 0;
		for (const label of channel.getIntervalCollectionLabels()) {
			for (const _ of channel.getIntervalCollection(label)) {
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
		[addInterval, usableWeights.addInterval, all(hasNotTooManyIntervals, hasNonzeroLength)],
		[deleteInterval, usableWeights.deleteInterval, hasAnInterval],
		[changeInterval, usableWeights.changeInterval, all(hasAnInterval, hasNonzeroLength)],
		[changeProperties, usableWeights.changeProperties, hasAnInterval],
	]);
}

const baseModel: Omit<
	DDSFuzzModel<SharedStringFactory, Operation, FuzzTestState>,
	"workloadName"
> = {
	generatorFactory: () =>
		take(100, makeOperationGenerator(defaultIntervalOperationGenerationConfig)),
	reducer:
		// makeReducer supports a param for logging output which tracks the provided intervalId over time:
		// { intervalId: "00000000-0000-0000-0000-000000000000", clientIds: ["A", "B", "C"] }
		makeReducer(),
	validateConsistency: assertEquivalentSharedStrings,
	factory: new SharedStringFactory(),
};

const defaultFuzzOptions: Partial<DDSFuzzSuiteOptions> = {
	validationStrategy: { type: "fixedInterval", interval: 10 },
	reconnectProbability: 0.1,
	numberOfClients: 3,
	clientJoinOptions: {
		maxNumberOfClients: 6,
		clientAddProbability: 0.1,
	},
	defaultTestCount: 100,
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

describe("IntervalCollection fuzz testing", () => {
	const model = {
		...baseModel,
		workloadName: "default interval collection",
	};

	createDDSFuzzSuite(model, {
		...defaultFuzzOptions,
		// AB#4477: Seed 12 is the same root cause as skipped regression test in intervalCollection.spec.ts--search for 4477.
		// The other failing seeds were added when updates of the msn on reconnects
		// were introduced to skip seeds due to a bug in a sequence DDS causing a `0x54e` error to occur.
		// The root cause of this bug is--roughly speaking--interval endpoints with StayOnRemove being placed
		// on segments that can be zamboni'd.
		// TODO:AB#5337: re-enable these seeds.
		skip: [
			3, 4, 9, 11, 12, 13, 19, 20, 32, 39, 41, 42, 43, 44, 45, 49, 52, 53, 55, 58, 61, 63, 74,
			76, 79, 86, 91, 92, 94,
		],
		// TODO:AB#5338: IntervalCollection doesn't correctly handle edits made while detached. Once supported,
		// this config should be enabled (deleting is sufficient: detached start is enabled by default)
		detachedStartOptions: {
			enabled: false,
			attachProbability: 0.2,
		},
		// Uncomment this line to replay a specific seed from its failure file:
		// replay: 0,
	});
});

describe("IntervalCollection no reconnect fuzz testing", () => {
	const noReconnectModel = {
		...baseModel,
		workloadName: "interval collection without reconnects",
	};

	const options = {
		...defaultFuzzOptions,
		reconnectProbability: 0.0,
		numberOfClients: 3,
		clientJoinOptions: {
			maxNumberOfClients: 3,
			clientAddProbability: 0.0,
		},
	};

	createDDSFuzzSuite(noReconnectModel, {
		...options,
		// AB#4477: Same root cause as skipped regression test in intervalCollection.spec.ts--search for 4477.
		skip: [80, 9, 12, 44],
		// TODO:AB#5338: IntervalCollection doesn't correctly handle edits made while detached. Once supported,
		// this config should be enabled (deleting is sufficient: detached start is enabled by default)
		detachedStartOptions: {
			enabled: false,
			attachProbability: 0.2,
		},
		// Uncomment this line to replay a specific seed from its failure file:
		// replay: 0,
	});
});

describe("IntervalCollection fuzz testing with rebased batches", () => {
	const noReconnectWithRebaseModel = {
		...baseModel,
		workloadName: "interval collection with rebasing",
	};

	createDDSFuzzSuite(noReconnectWithRebaseModel, {
		...defaultFuzzOptions,
		// ADO:4477: Same root cause as skipped regression test in intervalCollection.spec.ts--search for 4477.
		skip: [9, 12, 29],
		// TODO:AB#5338: IntervalCollection doesn't correctly handle edits made while detached. Once supported,
		// this config should be enabled (deleting is sufficient: detached start is enabled by default)
		detachedStartOptions: {
			enabled: false,
			attachProbability: 0.2,
		},
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
