/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	type AcceptanceCondition,
	type Reducer,
	combineReducers,
	createWeightedGenerator,
	takeAsync,
} from "@fluid-private/stochastic-test-utils";
import type { DDSFuzzModel, DDSFuzzTestState } from "@fluid-private/test-dds-utils";
import type { Serializable } from "@fluidframework/datastore-definitions/internal";

// eslint-disable-next-line import/no-internal-modules
import type { SharedArrayClass } from "../../array/sharedArray.js";
import type { SerializableTypeForSharedArray } from "../../index.js";
import { SharedArrayFactory } from "../../index.js";

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
 *
 */
export interface SharedArrayDelete {
	type: "delete";
	index: number;
}

/**
 * Type for the SharedArray operation
 *
 */
export interface SharedArrayMove {
	type: "move";
	oldIndex: number;
	newIndex: number;
}

/**
 * Type for the SharedArray operation
 *
 */
export interface SharedArrayToggle {
	type: "toggle";
	entryId: string;
}

/**
 * Type for the SharedArray operation
 *
 */
export interface SharedArrayToggleMove {
	type: "toggleMove";
	oldEntryId: string;
	newEntryId: string;
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
	}: DDSFuzzTestState<SharedArrayFactory<string>>): SharedArrayDelete => ({
		type: "delete",
		index: random.integer(0, Math.max(0, client.channel.get().length - 1)),
	});

	const moveOp = ({
		random,
		client,
	}: DDSFuzzTestState<SharedArrayFactory<string>>): SharedArrayMove => ({
		type: "move",
		oldIndex: random.integer(0, Math.max(0, client.channel.get().length - 1)),
		newIndex: random.integer(0, Math.max(0, client.channel.get().length)),
	});

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
		const sharedArray = client.channel as SharedArrayClass<string>;
		const entryId =
			sharedArray.getInsertEntryIds()[
				random.integer(0, Math.max(0, sharedArray.getInsertEntryIds().length - 1))
			];
		if (entryId === undefined) {
			throw new Error("No entryId found for toggle operation");
		}
		return {
			type: "toggle",
			entryId,
		};
	};

	const toggleMoveOp = ({
		random,
		client,
	}: DDSFuzzTestState<SharedArrayFactory<string>>): SharedArrayToggleMove => {
		const sharedArray = client.channel as SharedArrayClass<string>;
		const oldEntryId =
			sharedArray.getMoveEntryIds()[
				random.integer(0, Math.max(0, sharedArray.getMoveEntryIds().length - 1))
			];
		if (oldEntryId === undefined) {
			throw new Error("OLD");
		}
		const newEntryId =
			sharedArray.getMoveEntryIds()[
				random.integer(0, Math.max(0, sharedArray.getMoveEntryIds().length - 1))
			];
		if (newEntryId === undefined) {
			throw new Error("NEW");
		}
		return {
			type: "toggleMove",
			oldEntryId,
			newEntryId,
		};
	};

	const lengthSatisfies =
		(
			criteria: (length: number) => boolean,
		): AcceptanceCondition<
			DDSFuzzTestState<SharedArrayFactory<SerializableTypeForSharedArray>>
		> =>
		({ client }) =>
			criteria(client.channel.get().length);
	const movelengthSatisfies =
		(
			criteria: (length: number) => boolean,
		): AcceptanceCondition<
			DDSFuzzTestState<SharedArrayFactory<SerializableTypeForSharedArray>>
		> =>
		({ client }) =>
			criteria((client.channel as SharedArrayClass<string>).getMoveEntryIds().length);
	const insertLengthSatisfies =
		(
			criteria: (length: number) => boolean,
		): AcceptanceCondition<
			DDSFuzzTestState<SharedArrayFactory<SerializableTypeForSharedArray>>
		> =>
		({ client }) =>
			criteria((client.channel as SharedArrayClass<string>).getInsertEntryIds().length);
	const hasNonzeroLength = lengthSatisfies((length) => length > 0);
	const hasNonzeroMoveLength = movelengthSatisfies((length) => length > 2);
	const hasNonzeroInsertLength = insertLengthSatisfies((length) => length > 2);

	const syncGenerator = createWeightedGenerator<
		SharedArrayOperation<string>,
		DDSFuzzTestState<SharedArrayFactory<string>>
	>([
		[insertOp, weights.insert],
		[deleteOp, weights.delete, hasNonzeroLength],
		[moveOp, weights.move, hasNonzeroLength],
		[insertBulkAfterOp, weights.insertBulkAfter, hasNonzeroLength],
		[toggleOp, weights.toggle, hasNonzeroInsertLength],
		// [toggleMoveOp, weights.toggleMove, hasNonzeroMoveLength],
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
				toggle: 2,
				toggleMove: 1,
			}),
		),
	reducer: makeSharedArrayReducer<string>(),
	validateConsistency: async (a, b) => {
		assert.deepEqual(a.channel.get(), b.channel.get());
	},
	factory: new SharedArrayFactory<string>(),
};
