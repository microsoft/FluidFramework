/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	type Reducer,
	combineReducers,
	createWeightedGenerator,
	takeAsync,
} from "@fluid-private/stochastic-test-utils";
import type { DDSFuzzModel, DDSFuzzTestState } from "@fluid-private/test-dds-utils";
import type { Serializable } from "@fluidframework/datastore-definitions/internal";

import type { SerializableTypeForSharedArray } from "../../index.js";
import { SharedArrayFactory } from "../../index.js";

/**
 * Type for the SharedArray operation
 *
 * @internal
 */
export interface SharedArrayInsert<T> {
	type: "insert";
	index: number;
	value: T;
}

/**
 * Type for the SharedArray operation
 *
 * @internal
 */
export interface SharedArrayDelete {
	type: "delete";
	index: number;
}

/**
 * Type for the SharedArray operation
 *
 * @internal
 */
export interface SharedArrayMove {
	type: "move";
	oldIndex: number;
	newIndex: number;
}

/**
 * Type for the SharedArray operation
 *
 * @internal
 */
export interface SharedArrayToggle {
	type: "toggle";
	entryId: string;
}

/**
 * Type for the SharedArray operation
 *
 * @internal
 */
export interface SharedArrayToggleMove {
	type: "toggleMove";
	oldEntryId: string;
	newEntryId: string;
}

/**
 * Type for the SharedArray operation
 *
 * @internal
 */
export interface SharedArrayInsertBulkAfter<T> {
	type: "insertBulkAfter";
	ref: T | undefined;
	values: T[];
}

/**
 * SharedArray operations union type.
 *
 * @internal
 */
export type SharedArrayOperation<T> =
	| SharedArrayInsert<T>
	| SharedArrayDelete
	| SharedArrayMove
	| SharedArrayToggle
	| SharedArrayToggleMove
	| SharedArrayInsertBulkAfter<T>;

/**
 * Creates a reducer for SharedArray operations.
 * @internal
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
 * @internal
 */
export function makeSharedArrayOperationGenerator<T extends SerializableTypeForSharedArray>(
	valuesPool: T[],
	weights: { insert: number; delete: number; move: number },
): (state: DDSFuzzTestState<SharedArrayFactory<T>>) => Promise<SharedArrayOperation<T>> {
	const insertOp = ({
		random,
		client,
	}: DDSFuzzTestState<SharedArrayFactory<T>>): SharedArrayInsert<T> => ({
		type: "insert",
		index: random.integer(0, Math.max(0, client.channel.get().length)),
		value: random.pick(valuesPool),
	});

	const deleteOp = ({
		random,
		client,
	}: DDSFuzzTestState<SharedArrayFactory<T>>): SharedArrayDelete => ({
		type: "delete",
		index: random.integer(0, Math.max(0, client.channel.get().length - 1)),
	});

	const moveOp = ({
		random,
		client,
	}: DDSFuzzTestState<SharedArrayFactory<T>>): SharedArrayMove => ({
		type: "move",
		oldIndex: random.integer(0, Math.max(0, client.channel.get().length - 1)),
		newIndex: random.integer(0, Math.max(0, client.channel.get().length)),
	});

	// const toggleOp = ({
	// 	random,
	// 	client,
	// }: DDSFuzzTestState<SharedArrayFactory<T>>): SharedArrayToggle => ({
	// 	type: "toggle",
	// 	entryId: random.pick([...client.channel.get()]).id,
	// });

	// const toggleMoveOp = ({
	// 	random,
	// 	client,
	// }: DDSFuzzTestState<SharedArrayFactory<T>>): SharedArrayToggleMove => ({
	// 	type: "toggleMove",
	// 	oldEntryId: random.pick([...client.channel.get()]).id,
	// 	newEntryId: random.pick([...client.channel.get()]).id,
	// });

	// const insertBulkAfterOp = ({
	// 	random,
	// 	client,
	// }: DDSFuzzTestState<SharedArrayFactory<T>>): SharedArrayInsertBulkAfter<T> => ({
	// 	type: "insertBulkAfter",
	// 	ref: random.pick(client.channel.get()) ?? undefined,
	// 	values: random.shuffle(valuesPool).slice(0, random.integer(1, 3)),
	// });

	const syncGenerator = createWeightedGenerator<
		SharedArrayOperation<T>,
		DDSFuzzTestState<SharedArrayFactory<T>>
	>([
		[insertOp, weights.insert],
		[deleteOp, weights.delete],
		[moveOp, weights.move],
	]);

	return async (state: DDSFuzzTestState<SharedArrayFactory<T>>) => {
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
 * @internal
 */
export const baseSharedArrayModel: DDSFuzzModel<
	SharedArrayFactory<string>,
	SharedArrayOperation<string>
> = {
	workloadName: "default shared array",
	generatorFactory: () =>
		takeAsync(
			100,
			makeSharedArrayOperationGenerator(["A", "B", "C"], {
				insert: 5,
				delete: 1,
				move: 1,
			}),
		),
	reducer: makeSharedArrayReducer<string>(),
	validateConsistency: async (a, b) => {
		assert.deepEqual(a.channel.get(), b.channel.get());
	},
	factory: new SharedArrayFactory<string>(),
};
