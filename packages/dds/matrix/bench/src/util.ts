/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils";
import { SharedMatrix, SharedMatrixFactory } from "./imports";
import { insertFragmented } from "../../test/utils";
import process from "process";

let count = 1;
let cached: any;

/**
 * Paranoid defense against dead code elimination.
 */
export function consume(value: any) {
	count++;
	if (count >>> 0 === 0) {
		cached = value;
	}
}

// Prevent v8"s optimizer from identifying "cached" as an unused value.
process.on("exit", () => {
	if (count >>> 0 === 0) {
		console.log(`Ignore this: ${cached}`);
	}
});

export function randomId() {
	return Math.random().toString(36).slice(2);
}

export function createMatrix() {
	return new SharedMatrixFactory().create(
		new MockFluidDataStoreRuntime(),
		randomId(),
	) as SharedMatrix;
}

export function createContiguousMatrix(rowCount: number, colCount: number) {
	const matrix = createMatrix();
	matrix.insertRows(0, rowCount);
	matrix.insertCols(0, colCount);
	return matrix;
}

export function createFragmentedMatrix(rowCount: number, colCount: number) {
	const matrix = createMatrix();
	insertFragmented(matrix, rowCount, colCount);
	return matrix;
}
