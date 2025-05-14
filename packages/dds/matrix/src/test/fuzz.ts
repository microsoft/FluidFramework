/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	AsyncGenerator,
	Generator,
	combineReducers,
	createWeightedGenerator,
	takeAsync,
} from "@fluid-private/stochastic-test-utils";
import { DDSFuzzTestState, type DDSFuzzModel } from "@fluid-private/test-dds-utils";
import type { IFluidHandle } from "@fluidframework/core-interfaces";
import { isObject } from "@fluidframework/core-utils/internal";
import type { Serializable } from "@fluidframework/datastore-definitions/internal";
import { isFluidHandle } from "@fluidframework/runtime-utils/internal";

import { MatrixItem } from "../ops.js";
import { SharedMatrixFactory, SharedMatrix } from "../runtime.js";

/**
 * Supported cell values used within the fuzz model.
 */
type Value = string | number | undefined | Serializable<unknown>;

interface RangeSpec {
	start: number;
	count: number;
}

interface InsertRows extends RangeSpec {
	type: "insertRows";
}

interface InsertColumns extends RangeSpec {
	type: "insertCols";
}

interface RemoveRows extends RangeSpec {
	type: "removeRows";
}

interface RemoveColumns extends RangeSpec {
	type: "removeCols";
}

interface SetCell {
	type: "set";
	row: number;
	col: number;
	value: MatrixItem<Value>;
}

export type Operation = InsertRows | InsertColumns | RemoveRows | RemoveColumns | SetCell;

// This type gets used a lot as the state object of the suite; shorthand it here.
type State = DDSFuzzTestState<SharedMatrixFactory>;

async function assertMatricesAreEquivalent<T>(
	a: SharedMatrix<T>,
	b: SharedMatrix<T>,
): Promise<void> {
	assert.equal(
		a.colCount,
		b.colCount,
		`${a.id} and ${b.id} have different number of columns.`,
	);
	assert.equal(a.rowCount, b.rowCount, `${a.id} and ${b.id} have different number of rows.`);
	for (let row = 0; row < a.rowCount; row++) {
		for (let col = 0; col < a.colCount; col++) {
			const aVal = a.getCell(row, col);
			const bVal = b.getCell(row, col);
			if (isObject(aVal) === true) {
				assert(
					isObject(bVal),
					`${a.id} and ${b.id} differ at (${row}, ${col}): a is an object, b is not`,
				);
				const aHandle = isFluidHandle(aVal) ? await aVal.get() : aVal;
				const bHandle = isFluidHandle(bVal) ? await bVal.get() : bVal;
				assert.deepEqual(
					aHandle,
					bHandle,
					`${a.id} and ${b.id} differ at (${row}, ${col}): ${JSON.stringify(
						aHandle,
					)} vs ${JSON.stringify(bHandle)}`,
				);
			} else {
				assert.equal(
					aVal,
					bVal,
					`${a.id} and ${b.id} differ at (${row}, ${col}): ${aVal} vs ${bVal}`,
				);
			}
		}
	}
}

const reducer = combineReducers<Operation, State>({
	insertRows: ({ client }, { start, count }) => {
		client.channel.insertRows(start, count);
	},
	insertCols: ({ client }, { start, count }) => {
		client.channel.insertCols(start, count);
	},
	removeRows: ({ client }, { start, count }) => {
		client.channel.removeRows(start, count);
	},
	removeCols: ({ client }, { start, count }) => {
		client.channel.removeCols(start, count);
	},
	set: ({ client }, { row, col, value }) => {
		client.channel.setCell(row, col, value);
	},
});

interface GeneratorOptions {
	insertRowWeight: number;
	insertColWeight: number;
	removeRowWeight: number;
	removeColWeight: number;
	setWeight: number;
}

const defaultOptions: GeneratorOptions = {
	insertRowWeight: 1,
	insertColWeight: 1,
	removeRowWeight: 1,
	removeColWeight: 1,
	setWeight: 20,
};

function makeGenerator(
	optionsParam?: Partial<GeneratorOptions>,
): AsyncGenerator<Operation, State> {
	const { setWeight, insertColWeight, insertRowWeight, removeRowWeight, removeColWeight } = {
		...defaultOptions,
		...optionsParam,
	};

	const maxDimensionSizeChange = 3;

	const insertRows: Generator<InsertRows, State> = ({ random, client }) => ({
		type: "insertRows",
		start: random.integer(0, client.channel.rowCount),
		count: random.integer(1, maxDimensionSizeChange),
	});

	const removeRows: Generator<RemoveRows, State> = ({ random, client }) => {
		const start = random.integer(0, client.channel.rowCount - 1);
		const count = random.integer(
			1,
			Math.min(maxDimensionSizeChange, client.channel.rowCount - start),
		);
		return {
			type: "removeRows",
			start,
			count,
		};
	};

	const removeCols: Generator<RemoveColumns, State> = ({ random, client }) => {
		const start = random.integer(0, client.channel.colCount - 1);
		const count = random.integer(
			1,
			Math.min(maxDimensionSizeChange, client.channel.colCount - start),
		);
		return {
			type: "removeCols",
			start,
			count,
		};
	};

	const insertCols: Generator<InsertColumns, State> = ({ random, client }) => ({
		type: "insertCols",
		start: random.integer(0, client.channel.colCount),
		count: random.integer(1, maxDimensionSizeChange),
	});

	const setKey: Generator<SetCell, State> = ({ random, client }) => ({
		type: "set",
		row: random.integer(0, client.channel.rowCount - 1),
		col: random.integer(0, client.channel.colCount - 1),
		value: random.pick([
			(): number => random.integer(1, 50),
			(): string => random.string(random.integer(1, 2)),
			(): IFluidHandle => random.handle(),
		])(),
	});

	const syncGenerator = createWeightedGenerator<Operation, State>([
		[
			setKey,
			setWeight,
			(state): boolean =>
				state.client.channel.rowCount > 0 && state.client.channel.colCount > 0,
		],
		[insertRows, insertRowWeight],
		[insertCols, insertColWeight],
		[removeRows, removeRowWeight, (state): boolean => state.client.channel.rowCount > 0],
		[removeCols, removeColWeight, (state): boolean => state.client.channel.colCount > 0],
	]);

	return async (state) => syncGenerator(state);
}

export const baseSharedMatrixModel: Omit<
	DDSFuzzModel<SharedMatrixFactory, Operation>,
	"workloadName"
> = {
	factory: SharedMatrix.getFactory(),
	generatorFactory: () => takeAsync(50, makeGenerator()),
	reducer: (state, operation) => reducer(state, operation),
	validateConsistency: async (a, b) => assertMatricesAreEquivalent(a.channel, b.channel),
	minimizationTransforms: ["count", "start", "row", "col"].map((p) => (op) => {
		if (p in op && typeof op[p] === "number" && op[p] > 0) {
			op[p]--;
		}
	}),
};
