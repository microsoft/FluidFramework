/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import * as path from "node:path";

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import {
	type Generator,
	createWeightedAsyncGenerator,
	done,
	takeAsync,
} from "@fluid-private/stochastic-test-utils";
import {
	type DDSFuzzHarnessEvents,
	createSquashFuzzSuite,
	type SquashFuzzModel,
	type SquashFuzzTestState,
} from "@fluid-private/test-dds-utils";
import type { IFluidHandle } from "@fluidframework/core-interfaces";

import type { ISharedArray, SerializableTypeForSharedArray } from "../../index.js";
import { OperationType, SharedArrayFactory } from "../../index.js";

import { _dirname } from "./dirname.cjs";

type PoisonValue = SerializableTypeForSharedArray;

interface AddPoisonedHandle {
	type: "addPoisonedHandle";
	index: number;
}

interface InsertString {
	type: "insertString";
	index: number;
	value: string;
}

interface DeleteAt {
	type: "deleteAt";
	index: number;
}

interface MoveEntry {
	type: "moveEntry";
	oldIndex: number;
	newIndex: number;
}

type SquashOperation = AddPoisonedHandle | InsertString | DeleteAt | MoveEntry;

type SquashFactory = SharedArrayFactory<PoisonValue>;

type TrackablePoisonedSharedArray = ISharedArray<PoisonValue> & {
	poisonedEntryIds: Set<string>;
};

function isTrackable(channel: ISharedArray<PoisonValue>): channel is TrackablePoisonedSharedArray {
	return (channel as TrackablePoisonedSharedArray).poisonedEntryIds !== undefined;
}

function isPoisonedHandle(value: unknown): value is IFluidHandle & { poisoned: true } {
	return (
		value !== null &&
		typeof value === "object" &&
		(value as { poisoned?: unknown }).poisoned === true
	);
}

const eventEmitterForFuzzHarness = new TypedEventEmitter<DDSFuzzHarnessEvents>();

eventEmitterForFuzzHarness.on("clientCreate", (client) => {
	const channel = client.channel as TrackablePoisonedSharedArray;
	channel.poisonedEntryIds = new Set<string>();
	channel.on("valueChanged", (op) => {
		switch (op.type) {
			case OperationType.insertEntry: {
				// Poisoned-ness is tagged by reducer at addPoisonedHandle time;
				// nothing to do here for non-poisoned inserts.
				break;
			}
			case OperationType.deleteEntry: {
				channel.poisonedEntryIds.delete(op.entryId);
				break;
			}
			case OperationType.moveEntry: {
				if (channel.poisonedEntryIds.has(op.entryId)) {
					channel.poisonedEntryIds.delete(op.entryId);
					channel.poisonedEntryIds.add(op.changedToEntryId);
				}
				break;
			}
			case OperationType.toggle: {
				// Toggling a delete back to insert resurrects an entry; if it was poisoned,
				// it still is. We don't track the reverse direction because the generator
				// never targets poisoned entries with toggle ops.
				break;
			}
			case OperationType.toggleMove: {
				if (channel.poisonedEntryIds.has(op.changedToEntryId)) {
					channel.poisonedEntryIds.delete(op.changedToEntryId);
					channel.poisonedEntryIds.add(op.entryId);
				}
				break;
			}
			default: {
				break;
			}
		}
	});
});

function makeSquashGenerator(): (
	state: SquashFuzzTestState<SquashFactory>,
) => Promise<SquashOperation | typeof done> {
	const insertOp = async (state: SquashFuzzTestState<SquashFactory>): Promise<InsertString> => ({
		type: "insertString",
		index: state.random.integer(0, Math.max(0, state.client.channel.get().length)),
		value: state.random.string(state.random.integer(1, 5)),
	});

	const addPoisonedHandleOp = async (
		state: SquashFuzzTestState<SquashFactory>,
	): Promise<AddPoisonedHandle> => ({
		type: "addPoisonedHandle",
		index: state.random.integer(0, Math.max(0, state.client.channel.get().length)),
	});

	const deleteOp = async (state: SquashFuzzTestState<SquashFactory>): Promise<DeleteAt> => ({
		type: "deleteAt",
		index: state.random.integer(0, Math.max(0, state.client.channel.get().length - 1)),
	});

	const moveEntryOp = async (state: SquashFuzzTestState<SquashFactory>): Promise<MoveEntry> => {
		const len = state.client.channel.get().length;
		return {
			type: "moveEntry",
			oldIndex: state.random.integer(0, Math.max(0, len - 1)),
			newIndex: state.random.integer(0, Math.max(0, len)),
		};
	};

	const isInStagingMode = (state: SquashFuzzTestState<SquashFactory>): boolean =>
		state.client.stagingModeStatus === "staging";
	const hasEntries = (state: SquashFuzzTestState<SquashFactory>): boolean =>
		state.client.channel.get().length > 0;

	return createWeightedAsyncGenerator<SquashOperation, SquashFuzzTestState<SquashFactory>>([
		[insertOp, 6],
		[addPoisonedHandleOp, 3, isInStagingMode],
		[deleteOp, 3, hasEntries],
		// moveEntry intentionally omitted: its skip-list rewiring composes with insert chains
		// in ways that aren't yet covered by the chain walker. Tracked separately.
		[moveEntryOp, 0, hasEntries],
	]);
}

function makeExitingStagingModeGenerator(): Generator<
	SquashOperation,
	SquashFuzzTestState<SquashFactory>
> {
	return (state): SquashOperation | typeof done => {
		const channel = state.client.channel;
		const values = channel.get();
		for (let i = 0; i < values.length; i++) {
			if (isPoisonedHandle(values[i])) {
				return { type: "deleteAt", index: i };
			}
		}
		return done;
	};
}

function squashReducer(
	state: SquashFuzzTestState<SquashFactory>,
	op: SquashOperation,
): void {
	const { client } = state;
	assert(isTrackable(client.channel), "channel must be set up via clientCreate emitter");
	switch (op.type) {
		case "insertString": {
			client.channel.insert(op.index, op.value);
			break;
		}
		case "addPoisonedHandle": {
			const handle = state.random.poisonedHandle();
			const before = new Set<string>();
			const captureEntryId = (
				eventOp: { type: number; entryId?: string },
			): void => {
				if (eventOp.type === OperationType.insertEntry && eventOp.entryId !== undefined) {
					before.add(eventOp.entryId);
				}
			};
			client.channel.on("valueChanged", captureEntryId);
			try {
				client.channel.insert(op.index, handle);
			} finally {
				client.channel.off("valueChanged", captureEntryId);
			}
			for (const entryId of before) {
				client.channel.poisonedEntryIds.add(entryId);
			}
			break;
		}
		case "deleteAt": {
			client.channel.delete(op.index);
			break;
		}
		case "moveEntry": {
			client.channel.move(op.oldIndex, op.newIndex);
			break;
		}
		default: {
			break;
		}
	}
}

function validatePoisonedContentRemoved(client: {
	channel: ISharedArray<PoisonValue>;
}): void {
	const values = client.channel.get();
	for (let i = 0; i < values.length; i++) {
		assert(
			!isPoisonedHandle(values[i]),
			`Poisoned handle at index ${i} not removed before exiting staging mode`,
		);
	}
}

const squashModel: SquashFuzzModel<SquashFactory, SquashOperation> = {
	workloadName: "sharedArray squashing",
	generatorFactory: () => takeAsync(60, makeSquashGenerator()),
	reducer: squashReducer,
	validateConsistency: async (a, b) => {
		assert.deepEqual(a.channel.get(), b.channel.get());
	},
	factory: new SharedArrayFactory<PoisonValue>(),
	exitingStagingModeGeneratorFactory: makeExitingStagingModeGenerator,
	validatePoisonedContentRemoved,
};

describe("SharedArray squash fuzz", () => {
	createSquashFuzzSuite(squashModel, {
		validationStrategy: { type: "fixedInterval", interval: 10 },
		reconnectProbability: 0,
		numberOfClients: 1,
		clientJoinOptions: {
			maxNumberOfClients: 1,
			clientAddProbability: 0,
		},
		detachedStartOptions: { numOpsBeforeAttach: 0 },
		defaultTestCount: 50,
		saveFailures: { directory: path.join(_dirname, "../../src/test/results-squash") },
		emitter: eventEmitterForFuzzHarness,
		stagingMode: { changeStagingModeProbability: 0.2 },
	});
});
