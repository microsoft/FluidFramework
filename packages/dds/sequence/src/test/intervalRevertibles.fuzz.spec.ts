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
	DDSFuzzHarnessEvents,
} from "@fluid-internal/test-dds-utils";
import { PropertySet } from "@fluidframework/merge-tree";
import { TypedEventEmitter } from "@fluidframework/common-utils";
import { IIntervalCollection, SequenceInterval } from "../intervalCollection";
import { SharedStringFactory } from "../sequenceFactory";
import { SharedString } from "../sharedString";
import {
	appendAddIntervalToRevertibles,
	appendChangeIntervalToRevertibles,
	appendDeleteIntervalToRevertibles,
	appendIntervalPropertyChangedToRevertibles,
	appendSharedStringDeltaToRevertibles,
	SharedStringRevertible,
} from "../revertibles";
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
	makeRevertibleReducer,
	RevertSharedStringRevertibles,
	RevertOperation,
} from "./intervalCollection.fuzzUtils";
import { minimizeTestFromFailureFile } from "./intervalCollection.fuzzMinimization";

// Note: none of these options are currently exercised, since the fuzz test fails with pretty much
// any configuration due to known bugs. Once shared interval collections are in a better state these
// should be revisited.
interface OperationGenerationConfig {
	/**
	 * Maximum length of the SharedString (locally) before no further AddText operations are generated.
	 * Note due to concurency, during test execution the actual length of the string may exceed this.
	 */
	maxStringLength?: number;
	/**
	 * Maximum number of intervals (locally) before no further AddInterval operations are generated.
	 * Note due to concurency, during test execution the actual number of intervals may exceed this.
	 */
	maxIntervals?: number;
	maxInsertLength?: number;
	intervalCollectionNamePool?: string[];
	propertyNamePool?: string[];
	validateInterval?: number;
}

const defaultOptions: Required<OperationGenerationConfig> = {
	maxStringLength: 1000,
	maxIntervals: 100,
	maxInsertLength: 10,
	intervalCollectionNamePool: ["comments"],
	propertyNamePool: ["prop1", "prop2", "prop3"],
	validateInterval: 100,
};

const emitter = new TypedEventEmitter<DDSFuzzHarnessEvents>();

type RevertibleSharedString = SharedString & { revertibles: SharedStringRevertible[] };
function isRevertibleSharedString(s: SharedString): s is RevertibleSharedString {
	return (s as RevertibleSharedString).revertibles !== undefined;
}

emitter.on("clientCreate", (client) => {
	const channel = client.channel as RevertibleSharedString;
	channel.revertibles = [];

	channel.on("createIntervalCollection", () => {
		const labels = channel.getIntervalCollectionLabels();
		Array.from(labels).forEach((label) => {
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
});

const intervalTestOptions = {
	validationStrategy: { type: "fixedInterval", interval: 10 },
	reconnectProbability: 0.1,
	numberOfClients: 3,
	clientJoinOptions: {
		maxNumberOfClients: 6,
		clientAddProbability: 0.1,
		// not sure if this is the right place for this
		// mergeTreeUseNewLengthCalculations: true,
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

const optionsWithEmitter = {
	...intervalTestOptions,
	emitter,
};

type ClientOpState = FuzzTestState;
function makeOperationGenerator(
	optionsParam?: OperationGenerationConfig,
): Generator<RevertOperation, ClientOpState> {
	const options = { ...defaultOptions, ...(optionsParam ?? {}) };

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

	async function addInterval(state: ClientOpState): Promise<AddInterval> {
		return {
			type: "addInterval",
			...inclusiveRange(state),
			collectionName: state.random.pick(options.intervalCollectionNamePool),
			id: state.random.uuid4(),
			// added to get rid of compiler errors - assume we
			// don't want to test both features here
			stickiness: 0,
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

	async function revertSharedStringRevertibles(
		state: ClientOpState,
	): Promise<RevertSharedStringRevertibles> {
		return {
			type: "revertSharedStringRevertibles",
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

	const hasRevertibles = ({ channel }: ClientOpState): boolean => {
		// not convinced that this doesn't always return false
		const s = channel as RevertibleSharedString;
		if (!isRevertibleSharedString(s)) {
			return false;
		}
		return s.revertibles.length > 0;
	};

	const all =
		<T>(...clauses: AcceptanceCondition<T>[]): AcceptanceCondition<T> =>
		(t: T) =>
			clauses.reduce<boolean>((prev, cond) => prev && cond(t), true);

	return createWeightedGenerator<RevertOperation, ClientOpState>([
		[addText, 2, isShorterThanMaxLength],
		[removeRange, 1, hasNonzeroLength],
		// [addInterval, 0, all(hasNotTooManyIntervals, hasNonzeroLength)],
		[addInterval, 2, all(hasNotTooManyIntervals, hasNonzeroLength)],
		// [deleteInterval, 2, hasAnInterval],
		// [changeInterval, 2, all(hasAnInterval, hasNonzeroLength)],
		[changeProperties, 2, hasAnInterval],
		[revertSharedStringRevertibles, 2, hasRevertibles],
	]);
}

describe.skip("IntervalCollection fuzz testing", () => {
	const model: DDSFuzzModel<SharedStringFactory, RevertOperation, FuzzTestState> = {
		workloadName: "interval collection with revertibles",
		generatorFactory: () => take(100, makeOperationGenerator()),
		reducer:
			// makeReducer supports a param for logging output which tracks the provided intervalId over time:
			// { intervalId: "00000000-0000-0000-0000-000000000000", clientIds: ["A", "B", "C"] }
			makeRevertibleReducer(),
		validateConsistency: assertEquivalentSharedStrings,
		factory: new SharedStringFactory(),
	};

	createDDSFuzzSuite(
		model,
		// optionsWithEmitter,
		{
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
			emitter,
		},
	);
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
