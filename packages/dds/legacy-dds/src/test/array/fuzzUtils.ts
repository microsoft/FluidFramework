/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import {
	type AcceptanceCondition,
	type Reducer,
	combineReducers,
	createWeightedGenerator,
	takeAsync,
} from "@fluid-private/stochastic-test-utils";
import type {
	DDSFuzzHarnessEvents,
	DDSFuzzModel,
	DDSFuzzTestState,
} from "@fluid-private/test-dds-utils";
import { unreachableCase } from "@fluidframework/core-utils/internal";
import type { Serializable } from "@fluidframework/datastore-definitions/internal";

import type { ISharedArray, SerializableTypeForSharedArray } from "../../index.js";
import { OperationType, SharedArrayFactory } from "../../index.js";

/**
 * Type for the SharedArray operation
 *
 */
export interface SharedArrayInsert<T> {
	type: "insert";
	index: number;
	value: T;
}

/**
 * Type for the SharedArray operation
 * DEBUG_value used entirely for debugging purposes to back track
 * operations by value in the generated json files.
 */
export interface SharedArrayDelete {
	type: "delete";
	index: number;
	DEBUG_value: unknown;
}

/**
 * Type for the SharedArray operation
 * DEBUG_value used entirely for debugging purposes to back track
 * operations by value in the generated json files.
 */
export interface SharedArrayMove {
	type: "move";
	oldIndex: number;
	newIndex: number;
	DEBUG_value: unknown;
}

/**
 * Type for the SharedArray operation
 * DEBUG_value used entirely for debugging purposes to back track
 * operations by value in the generated json files.
 */
export interface SharedArrayToggle {
	type: "toggle";
	entryId: string;
	DEBUG_value: unknown;
}

/**
 * Type for the SharedArray operation
 * DEBUG_value used entirely for debugging purposes to back track
 * operations by value in the generated json files.
 */
export interface SharedArrayToggleMove {
	type: "toggleMove";
	oldEntryId: string;
	newEntryId: string;
	DEBUG_value: unknown;
}

/**
 * Type for the SharedArray operation
 *
 */
export interface SharedArrayInsertBulkAfter<T> {
	type: "insertBulkAfter";
	ref: T | undefined;
	values: T[];
}

/**
 * SharedArray operations union type.
 *
 */
export type SharedArrayOperation<T> =
	| SharedArrayInsert<T>
	| SharedArrayDelete
	| SharedArrayMove
	| SharedArrayToggle
	| SharedArrayToggleMove
	| SharedArrayInsertBulkAfter<T>;

/**
 * Event emitter for the fuzz harness.
 */
export const eventEmitterForFuzzHarness = new TypedEventEmitter<DDSFuzzHarnessEvents>();

type TrackableSharedArray = ISharedArray<SerializableTypeForSharedArray> & {
	// This is used to track the entry IDs for insert and move operations.
	insertIds: Map<string, unknown>;
	deleteIds: Map<string, unknown>;
	moveIds: Map<string, string>;
};

eventEmitterForFuzzHarness.on("clientCreate", (client) => {
	const channel = client.channel as TrackableSharedArray;
	channel.insertIds = new Map<string, unknown>();
	channel.deleteIds = new Map<string, unknown>();
	channel.moveIds = new Map<string, string>();

	// Register listener to track insert entry IDs
	channel.on("valueChanged", (op, _isLocal, _target) => {
		switch (op.type) {
			case OperationType.insertEntry: {
				const entryId = op.entryId;
				channel.insertIds.set(entryId, op.value);
				channel.deleteIds.delete(entryId);
				break;
			}
			case OperationType.deleteEntry: {
				const entryId = op.entryId;
				channel.deleteIds.set(entryId, channel.insertIds.get(entryId));
				channel.insertIds.delete(entryId);
				channel.moveIds.delete(entryId);
				break;
			}
			case OperationType.moveEntry: {
				if (channel.insertIds.has(op.entryId)) {
					channel.insertIds.set(op.changedToEntryId, channel.insertIds.get(op.entryId));
					channel.insertIds.delete(op.entryId);
					channel.moveIds.set(op.entryId, op.changedToEntryId);
				}
				break;
			}
			case OperationType.toggle: {
				if (channel.insertIds.has(op.entryId)) {
					channel.deleteIds.set(op.entryId, channel.insertIds.get(op.entryId));
					channel.insertIds.delete(op.entryId);
					channel.moveIds.delete(op.entryId);
				} else {
					channel.insertIds.set(op.entryId, channel.deleteIds.get(op.entryId));
					channel.deleteIds.delete(op.entryId);
				}
				break;
			}
			case OperationType.toggleMove: {
				channel.insertIds.set(op.entryId, channel.insertIds.get(op.changedToEntryId));
				channel.insertIds.delete(op.changedToEntryId);
				channel.moveIds.delete(op.changedToEntryId);
				channel.moveIds.set(op.changedToEntryId, op.entryId);
				break;
			}
			default: {
				unreachableCase(op);
			}
		}
	});
});
/**
 * Creates a reducer for SharedArray operations.
 */
export function makeSharedArrayReducer<T extends SerializableTypeForSharedArray>(): Reducer<
	SharedArrayOperation<T>,
	DDSFuzzTestState<SharedArrayFactory<T>>
> {
	return combineReducers({
		insert: ({ client }, { index, value }) => {
			client.channel.insert(index, value as Serializable<typeof value> & T);
		},
		insertBulkAfter: ({ client }, { ref, values }) => {
			client.channel.insertBulkAfter(
				ref,
				values.map((v) => v as Serializable<T> & T),
			);
		},
		delete: ({ client }, { index }) => {
			client.channel.delete(index);
		},
		move: ({ client }, { oldIndex, newIndex }) => {
			client.channel.move(oldIndex, newIndex);
		},
		toggle: ({ client }, { entryId }) => {
			client.channel.toggle(entryId);
		},
		toggleMove: ({ client }, { oldEntryId, newEntryId }) => {
			client.channel.toggleMove(oldEntryId, newEntryId);
		},
	});
}

/**
 * Creates a generator that yields SharedArray operations.
 *
 */
export function makeSharedArrayOperationGenerator(weights: {
	insert: number;
	delete: number;
	move: number;
	insertBulkAfter: number;
	toggle: number;
	toggleMove: number;
}): (
	state: DDSFuzzTestState<SharedArrayFactory<string>>,
) => Promise<SharedArrayOperation<string>> {
	const insertOp = ({
		random,
		client,
	}: DDSFuzzTestState<SharedArrayFactory<string>>): SharedArrayInsert<string> => ({
		type: "insert",
		index: random.integer(0, Math.max(0, client.channel.get().length)),
		value: random.string(random.integer(1, 5)),
	});

	const deleteOp = ({
		random,
		client,
	}: DDSFuzzTestState<SharedArrayFactory<string>>): SharedArrayDelete => {
		const index = random.integer(0, Math.max(0, client.channel.get().length - 1));
		return {
			type: "delete",
			index,
			DEBUG_value: client.channel.get()[index],
		};
	};

	const moveOp = ({
		random,
		client,
	}: DDSFuzzTestState<SharedArrayFactory<string>>): SharedArrayMove => {
		const oldIndex = random.integer(0, Math.max(0, client.channel.get().length - 1));
		const newIndex = random.integer(0, Math.max(0, client.channel.get().length));
		return {
			type: "move",
			oldIndex,
			newIndex,
			DEBUG_value: client.channel.get()[oldIndex],
		};
	};

	const insertBulkAfterOp = ({
		random,
		client,
	}: DDSFuzzTestState<SharedArrayFactory<string>>): SharedArrayInsertBulkAfter<string> => {
		const ref = random.integer(0, Math.max(0, client.channel.get().length - 1));
		const values = Array.from({ length: random.integer(1, 5) }, () =>
			random.string(random.integer(1, 5)),
		);
		return {
			type: "insertBulkAfter",
			ref: client.channel.get()[ref],
			values,
		};
	};

	const toggleOp = ({
		random,
		client,
	}: DDSFuzzTestState<SharedArrayFactory<string>>): SharedArrayToggle => {
		const sharedArray = client.channel as TrackableSharedArray;
		const entryIds = [...sharedArray.insertIds.keys(), ...sharedArray.deleteIds.keys()];
		if (entryIds.length === 0) {
			throw new Error("No entryIds found for toggle operation");
		}
		const entryId = entryIds[random.integer(0, Math.max(0, entryIds.length - 1))];
		if (entryId === undefined) {
			throw new Error("No entryId found for toggle operation");
		}
		return {
			type: "toggle",
			entryId,
			DEBUG_value: sharedArray.insertIds.get(entryId) ?? sharedArray.deleteIds.get(entryId),
		};
	};

	const toggleMoveOp = ({
		random,
		client,
	}: DDSFuzzTestState<SharedArrayFactory<string>>): SharedArrayToggleMove => {
		const sharedArray = client.channel as TrackableSharedArray;
		const entryIds = [...sharedArray.moveIds.keys()];
		const index = random.integer(0, Math.max(0, entryIds.length - 1));
		const oldEntryId = entryIds[index];
		if (oldEntryId === undefined) {
			throw new Error("No old entryId found for toggleMove operation");
		}
		const newEntryId = sharedArray.moveIds.get(oldEntryId);
		if (newEntryId === undefined) {
			throw new Error("No new entryId found for toggleMove operation");
		}
		return {
			type: "toggleMove",
			oldEntryId,
			newEntryId,
			DEBUG_value: sharedArray.insertIds.get(newEntryId),
		};
	};

	const moveLengthSatisfies =
		(
			criteria: (length: number) => boolean,
		): AcceptanceCondition<
			DDSFuzzTestState<SharedArrayFactory<SerializableTypeForSharedArray>>
		> =>
		({ client }) =>
			criteria((client.channel as TrackableSharedArray).moveIds?.size ?? 0);
	const insertLengthSatisfies =
		(
			criteria: (length: number) => boolean,
		): AcceptanceCondition<
			DDSFuzzTestState<SharedArrayFactory<SerializableTypeForSharedArray>>
		> =>
		({ client }) =>
			criteria((client.channel as TrackableSharedArray).insertIds?.size ?? 0);
	const toggleLengthSatisfies =
		(
			criteria: (length: number) => boolean,
		): AcceptanceCondition<
			DDSFuzzTestState<SharedArrayFactory<SerializableTypeForSharedArray>>
		> =>
		({ client }) => {
			const trackable = client.channel as TrackableSharedArray;
			const totalSize = (trackable.insertIds?.size ?? 0) + (trackable.deleteIds?.size ?? 0);
			return criteria(totalSize);
		};
	const hasEnoughMoveLength = moveLengthSatisfies((length) => length > 2);
	const hasEnoughInsertLength = insertLengthSatisfies((length) => length > 0);
	const hasEnoughToggleLength = toggleLengthSatisfies((length) => length > 0);

	const syncGenerator = createWeightedGenerator<
		SharedArrayOperation<string>,
		DDSFuzzTestState<SharedArrayFactory<string>>
	>([
		[insertOp, weights.insert],
		[deleteOp, weights.delete, hasEnoughInsertLength],
		[moveOp, weights.move, hasEnoughInsertLength],
		[insertBulkAfterOp, weights.insertBulkAfter, hasEnoughInsertLength],
		[toggleOp, weights.toggle, hasEnoughToggleLength],
		[toggleMoveOp, weights.toggleMove, hasEnoughMoveLength],
	]);

	return async (state: DDSFuzzTestState<SharedArrayFactory<string>>) => {
		const op = syncGenerator(state);
		// Work around
		if (typeof op === "symbol") {
			throw new TypeError("Operation generator returned done symbol unexpectedly.");
		}
		return op;
	};
}

/**
 *
 * Base SharedArray fuzz model for testing.
 */
export const baseSharedArrayModel: DDSFuzzModel<
	SharedArrayFactory<string>,
	SharedArrayOperation<string>
> = {
	workloadName: "default shared array",
	generatorFactory: () =>
		takeAsync(
			100,
			makeSharedArrayOperationGenerator({
				insert: 5,
				delete: 3,
				move: 3,
				insertBulkAfter: 1,
				toggle: 1,
				toggleMove: 1,
			}),
		),
	reducer: makeSharedArrayReducer<string>(),
	validateConsistency: async (a, b) => {
		assert.deepEqual(a.channel.get(), b.channel.get());
	},
	factory: new SharedArrayFactory<string>(),
};
