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
	type SquashFuzzModel,
	type SquashFuzzTestState,
	createSquashFuzzSuite,
} from "@fluid-private/test-dds-utils";
import { isFluidHandle } from "@fluidframework/runtime-utils/internal";

import { SharedMatrix, type SharedMatrixFactory } from "../runtime.js";

import { _dirname } from "./dirname.cjs";

interface InsertRowsOp {
	type: "insertRows";
	start: number;
	count: number;
}
interface InsertColsOp {
	type: "insertCols";
	start: number;
	count: number;
}
interface SetCellOp {
	type: "set";
	row: number;
	col: number;
	value: string | number;
}
interface SetPoisonedCellOp {
	type: "setPoisoned";
	row: number;
	col: number;
}
interface ClearCellOp {
	type: "clearCell";
	row: number;
	col: number;
}

type SquashOp = InsertRowsOp | InsertColsOp | SetCellOp | SetPoisonedCellOp | ClearCellOp;

type FuzzState = SquashFuzzTestState<SharedMatrixFactory>;

function isPoisonedHandle(value: unknown): boolean {
	return (
		isFluidHandle(value) && (value as unknown as { poisoned?: unknown }).poisoned === true
	);
}

function findFirstPoisoned(channel: SharedMatrix): { row: number; col: number } | undefined {
	for (let row = 0; row < channel.rowCount; row++) {
		for (let col = 0; col < channel.colCount; col++) {
			if (isPoisonedHandle(channel.getCell(row, col))) {
				return { row, col };
			}
		}
	}
	return undefined;
}

function makeGenerator(): (state: FuzzState) => Promise<SquashOp | typeof done> {
	const isInStaging = (state: FuzzState): boolean =>
		state.client.stagingModeStatus === "staging";
	const hasCells = (state: FuzzState): boolean =>
		state.client.channel.rowCount > 0 && state.client.channel.colCount > 0;

	const insertRows = async (state: FuzzState): Promise<InsertRowsOp> => ({
		type: "insertRows",
		start: state.random.integer(0, state.client.channel.rowCount),
		count: state.random.integer(1, 3),
	});
	const insertCols = async (state: FuzzState): Promise<InsertColsOp> => ({
		type: "insertCols",
		start: state.random.integer(0, state.client.channel.colCount),
		count: state.random.integer(1, 3),
	});
	const setCell = async (state: FuzzState): Promise<SetCellOp> => ({
		type: "set",
		row: state.random.integer(0, state.client.channel.rowCount - 1),
		col: state.random.integer(0, state.client.channel.colCount - 1),
		value: state.random.pick([
			(): string => state.random.string(state.random.integer(1, 3)),
			(): number => state.random.integer(0, 100),
		])(),
	});
	const setPoisoned = async (state: FuzzState): Promise<SetPoisonedCellOp> => ({
		type: "setPoisoned",
		row: state.random.integer(0, state.client.channel.rowCount - 1),
		col: state.random.integer(0, state.client.channel.colCount - 1),
	});
	const clearCell = async (state: FuzzState): Promise<ClearCellOp> => ({
		type: "clearCell",
		row: state.random.integer(0, state.client.channel.rowCount - 1),
		col: state.random.integer(0, state.client.channel.colCount - 1),
	});

	return createWeightedAsyncGenerator<SquashOp, FuzzState>([
		[insertRows, 4],
		[insertCols, 4],
		[setCell, 10, hasCells],
		[setPoisoned, 6, (state) => isInStaging(state) && hasCells(state)],
		[clearCell, 3, hasCells],
	]);
}

function makeExitingGenerator(): Generator<SquashOp, FuzzState> {
	return (state): SquashOp | typeof done => {
		const found = findFirstPoisoned(state.client.channel);
		if (found === undefined) {
			return done;
		}
		return { type: "clearCell", row: found.row, col: found.col };
	};
}

function reducer(state: FuzzState, op: SquashOp): void {
	const { client } = state;
	switch (op.type) {
		case "insertRows": {
			client.channel.insertRows(op.start, op.count);
			break;
		}
		case "insertCols": {
			client.channel.insertCols(op.start, op.count);
			break;
		}
		case "set": {
			if (op.row < client.channel.rowCount && op.col < client.channel.colCount) {
				client.channel.setCell(op.row, op.col, op.value);
			}
			break;
		}
		case "setPoisoned": {
			if (op.row < client.channel.rowCount && op.col < client.channel.colCount) {
				client.channel.setCell(op.row, op.col, state.random.poisonedHandle());
			}
			break;
		}
		case "clearCell": {
			if (op.row < client.channel.rowCount && op.col < client.channel.colCount) {
				client.channel.setCell(op.row, op.col, undefined);
			}
			break;
		}
		default: {
			break;
		}
	}
}

const squashModel: SquashFuzzModel<SharedMatrixFactory, SquashOp> = {
	workloadName: "matrix squashing",
	generatorFactory: () => takeAsync(60, makeGenerator()),
	reducer,
	validateConsistency: async (a, b) => {
		assert.equal(a.channel.rowCount, b.channel.rowCount);
		assert.equal(a.channel.colCount, b.channel.colCount);
		for (let r = 0; r < a.channel.rowCount; r++) {
			for (let c = 0; c < a.channel.colCount; c++) {
				const va = a.channel.getCell(r, c);
				const vb = b.channel.getCell(r, c);
				if (isFluidHandle(va)) {
					assert(isFluidHandle(vb));
				} else {
					assert.deepEqual(va, vb);
				}
			}
		}
	},
	factory: SharedMatrix.getFactory(),
	exitingStagingModeGeneratorFactory: makeExitingGenerator,
	validatePoisonedContentRemoved: (client) => {
		const found = findFirstPoisoned(client.channel);
		assert(
			found === undefined,
			`Poisoned handle at (${found?.row}, ${found?.col}) not removed before exiting staging`,
		);
	},
};

const emitter = new TypedEventEmitter<DDSFuzzHarnessEvents>();

describe("SharedMatrix squash fuzz", () => {
	createSquashFuzzSuite(squashModel, {
		validationStrategy: { type: "fixedInterval", interval: 10 },
		reconnectProbability: 0.1,
		numberOfClients: 3,
		clientJoinOptions: {
			maxNumberOfClients: 4,
			clientAddProbability: 0.05,
		},
		detachedStartOptions: { numOpsBeforeAttach: 0 },
		defaultTestCount: 50,
		saveFailures: { directory: path.join(_dirname, "../../src/test/results-squash-matrix") },
		emitter,
		stagingMode: { changeStagingModeProbability: 0.15 },
	});
});
