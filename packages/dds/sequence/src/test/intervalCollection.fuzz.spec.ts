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
import { IIntervalCollection, IntervalStickiness, SequenceInterval } from "../intervalCollection";
import { SharedStringFactory } from "../sequenceFactory";
import { assertEquivalentSharedStrings } from "./intervalUtils";
import {
	Operation,
	RangeSpec,
	AddText,
	RemoveRange,
	AddInterval,
	DeleteInterval,
	ChangeInterval,
	ChangeProperties,
	FuzzTestState,
	makeReducer,
	OperationGenerationConfig,
	defaultOperationGenerationConfig,
} from "./intervalCollection.fuzzUtils";
import { minimizeTestFromFailureFile } from "./intervalCollection.fuzzMinimization";

type ClientOpState = FuzzTestState;
export function makeOperationGenerator(
	optionsParam?: OperationGenerationConfig,
	alwaysLeaveChar: boolean = false,
): Generator<Operation, ClientOpState> {
	const options = { ...defaultOperationGenerationConfig, ...(optionsParam ?? {}) };

	function isNonEmpty(collection: IIntervalCollection<SequenceInterval>): boolean {
		for (const _ of collection) {
			return true;
		}

		return false;
	}

	// All subsequent helper functions are generators; note that they don't actually apply any operations.
	function startPosition({ random, channel }: ClientOpState): number {
		return random.integer(0, Math.max(0, channel.getLength() - 1));
	}

	function exclusiveRange(state: ClientOpState): RangeSpec {
		const start = startPosition(state);
		const end = state.random.integer(start + 1, state.channel.getLength());
		return { start, end };
	}

	function exclusiveRangeLeaveChar(state: ClientOpState): RangeSpec {
		const start = state.random.integer(0, state.channel.getLength() - 2);
		const end = state.random.integer(start + 1, state.channel.getLength() - 1);
		return { start, end };
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

	async function addText(state: ClientOpState): Promise<AddText> {
		const { random, channel } = state;
		return {
			type: "addText",
			index: random.integer(0, channel.getLength()),
			content: random.string(random.integer(0, options.maxInsertLength)),
		};
	}

	async function removeRange(state: ClientOpState): Promise<RemoveRange> {
		return { type: "removeRange", ...exclusiveRange(state) };
	}

	async function removeRangeLeaveChar(state: ClientOpState): Promise<RemoveRange> {
		return { type: "removeRange", ...exclusiveRangeLeaveChar(state) };
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

	const lengthSatisfies =
		(criteria: (length: number) => boolean): AcceptanceCondition<ClientOpState> =>
		({ channel }) =>
			criteria(channel.getLength());
	const hasNonzeroLength = lengthSatisfies((length) => length > 0);
	const isShorterThanMaxLength = lengthSatisfies((length) => length < options.maxStringLength);

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
	const usableWeights = optionsParam?.weights ?? defaultOperationGenerationConfig.weights;
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
	generatorFactory: () => take(100, makeOperationGenerator(defaultOperationGenerationConfig)),
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
		// Uncomment this line to replay a specific seed from its failure file:
		// replay: 0,
	});
});

describe("IntervalCollection no reconnect fuzz testing", () => {
	const noReconnectModel = {
		...baseModel,
		workloadName: "interval collection without reconnects",
	};

	const noReconnectNoIntervalsModel = {
		...baseModel,
		workloadName: "interval collection without reconnects or intervals",
		generatorFactory: () =>
			take(
				100,
				makeOperationGenerator({
					...defaultOperationGenerationConfig,
					weights: {
						...defaultOperationGenerationConfig.weights,
						addInterval: 0,
						deleteInterval: 0,
						changeInterval: 0,
						changeProperties: 0,
					},
				}),
			),
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
		skip: [80],
		// Uncomment this line to replay a specific seed from its failure file:
		// replay: 0,
	});

	createDDSFuzzSuite(noReconnectNoIntervalsModel, {
		...options,
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
