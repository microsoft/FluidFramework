/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { IGCTestProvider, runGCTests } from "@fluid-private/test-dds-utils";
import { AttachState } from "@fluidframework/container-definitions";
import type { IFluidHandleInternal } from "@fluidframework/core-interfaces/internal";
import {
	IChannelServices,
	type IChannel,
} from "@fluidframework/datastore-definitions/internal";
import type { ISegmentInternal } from "@fluidframework/merge-tree/internal";
import {
	MockContainerRuntimeFactory,
	MockContainerRuntimeFactoryForReconnection,
	MockContainerRuntimeForReconnection,
	MockEmptyDeltaConnection,
	MockFluidDataStoreRuntime,
	MockHandle,
	MockStorage,
} from "@fluidframework/test-runtime-utils/internal";

import {
	type ISharedMatrix,
	MatrixItem,
	SharedMatrix,
	SharedMatrixFactory,
} from "../index.js";
import { SharedMatrix as SharedMatrixClass } from "../matrix.js";
import type { PermutationVector } from "../permutationvector.js";

import { TestConsumer } from "./testconsumer.js";
import { check, expectSize, extract, fill, insertFragmented, matrixFactory } from "./utils.js";

function createConnectedMatrix(
	id: string,
	runtimeFactory: MockContainerRuntimeFactory,
	isSetCellPolicyFWW: boolean,
): ISharedMatrix & IChannel {
	const dataStoreRuntime = new MockFluidDataStoreRuntime();
	const matrix = matrixFactory.create(dataStoreRuntime, id);
	if (isSetCellPolicyFWW) {
		matrix.switchSetCellPolicy();
	}

	runtimeFactory.createContainerRuntime(dataStoreRuntime);
	matrix.connect({
		deltaConnection: dataStoreRuntime.createDeltaConnection(),
		objectStorage: new MockStorage(),
	});
	return matrix;
}

function createLocalMatrix(id: string): SharedMatrixClass {
	const factory = new SharedMatrixFactory();
	return factory.create(new MockFluidDataStoreRuntime(), id) as SharedMatrixClass;
}

function createMatrixForReconnection(
	id: string,
	runtimeFactory: MockContainerRuntimeFactoryForReconnection,
	isSetCellPolicyFWW: boolean,
): {
	matrix: ISharedMatrix & IChannel;
	containerRuntime: MockContainerRuntimeForReconnection;
} {
	const dataStoreRuntime = new MockFluidDataStoreRuntime();
	const containerRuntime = runtimeFactory.createContainerRuntime(dataStoreRuntime);
	const services = {
		deltaConnection: dataStoreRuntime.createDeltaConnection(),
		objectStorage: new MockStorage(),
	};

	const matrix = matrixFactory.create(dataStoreRuntime, id);
	if (isSetCellPolicyFWW) {
		matrix.switchSetCellPolicy();
	}
	matrix.connect(services);
	return { matrix, containerRuntime };
}

describe("Matrix1", () => {
	for (const isSetCellPolicyFWW of [false, true]) {
		describe(`Matrix isSetCellPolicyFWW=${isSetCellPolicyFWW}`, () => {
			describe("local client", () => {
				let matrix: SharedMatrix<number>;

				// Test IMatrixConsumer that builds a copy of `matrix` via observed events.
				let consumer: TestConsumer<number>;

				// Summarizes the given `SharedMatrix`, loads the summarize into a 2nd SharedMatrix, vets that the two are
				// equivalent, and then returns the 2nd matrix.
				async function summarize<T>(
					matrix: SharedMatrix<T>,
				): Promise<ISharedMatrix & IChannel> {
					// Create a summary
					const objectStorage = MockStorage.createFromSummary(
						matrix.getAttachSummary().summary,
					);

					// Create a local DataStoreRuntime since we only want to load the summary for a local client.
					const dataStoreRuntime = new MockFluidDataStoreRuntime({
						attachState: AttachState.Detached,
					});

					// Load the summary into a newly created 2nd SharedMatrix.
					const matrix2 = await matrixFactory.load(
						dataStoreRuntime,
						`load(${matrix.id})`,
						{ deltaConnection: new MockEmptyDeltaConnection(), objectStorage },
						matrixFactory.attributes,
					);

					// Vet that the 2nd matrix is equivalent to the original.
					expectSize(matrix2, matrix.rowCount, matrix.colCount);
					assert.deepEqual(
						extract(matrix),
						extract(matrix2),
						"Matrix must round-trip through summarize/load.",
					);

					return matrix2;
				}

				async function expect<T>(
					expected: readonly (readonly MatrixItem<T>[])[],
				): Promise<ISharedMatrix & IChannel> {
					const actual = extract(matrix);
					assert.deepEqual(actual, expected, "Matrix must match expected.");
					assert.deepEqual(
						extract(consumer),
						actual,
						"Matrix must notify IMatrixConsumers of all changes.",
					);
					return summarize(matrix);
				}

				beforeEach("createMatrix", async () => {
					matrix = matrixFactory.create(new MockFluidDataStoreRuntime(), "matrix1");
					if (isSetCellPolicyFWW) {
						matrix.switchSetCellPolicy();
					}

					// Attach a new IMatrixConsumer
					consumer = new TestConsumer(matrix);
				});

				afterEach(async () => {
					// Paranoid check that ensures that the SharedMatrix loaded from the summary also
					// round-trips through summarize/load.  (Also, may help detect summarize/loaded bugs
					// in the event that the test case forgets to call/await `expect()`.)
					await summarize(await summarize(matrix));

					assert.deepEqual(
						extract(consumer),
						extract(matrix),
						"Matrix must notify IMatrixConsumers of all changes.",
					);

					// Sanity check that removing the consumer stops change notifications.
					matrix.closeMatrix(consumer);
					matrix.insertCols(0, 1);
					assert.equal(consumer.colCount, matrix.colCount - 1);
				});

				// Vet our three variants of an empty matrix (no rows, no cols, and both no rows and no cols).
				describe("empty matrices", () => {
					// Note: We check the num rows/cols explicitly in these tests to differentiate between
					//       matrices that are 0 length in one or both dimensions.
					it("0x0", async () => {
						expectSize(matrix, /* rowCount: */ 0, /* colCount: */ 0);
						expectSize(await expect([]), /* rowCount: */ 0, /* colCount: */ 0);
					});

					it("0x1", async () => {
						matrix.insertCols(/* start: */ 0, /* count: */ 1);
						expectSize(matrix, /* rowCount: */ 0, /* colCount: */ 1);
						expectSize(await expect([]), /* rowCount: */ 0, /* colCount: */ 1);
					});

					it("1x0", async () => {
						matrix.insertRows(/* start: */ 0, /* count: */ 1);
						expectSize(matrix, /* rowCount: */ 1, /* colCount: */ 0);
						expectSize(await expect([[]]), /* rowCount: */ 1, /* colCount: */ 0);
					});
				});

				// Vet that we can set and read back the cell in a 1x1 matrix.
				it("get/set cell", async () => {
					matrix.insertRows(/* start: */ 0, /* count: */ 1);
					matrix.insertCols(/* start: */ 0, /* count: */ 1);
					await expect([[undefined]]);

					matrix.setCell(/* row: */ 0, /* col: */ 0, 1);
					await expect([[1]]);
				});

				// Vet that we can set a range of cells with `setCells()`.
				it("get/set cells", async () => {
					matrix.insertRows(/* start: */ 0, /* count: */ 4);
					matrix.insertCols(/* start: */ 0, /* count: */ 4);

					await expect([
						[undefined, undefined, undefined, undefined],
						[undefined, undefined, undefined, undefined],
						[undefined, undefined, undefined, undefined],
						[undefined, undefined, undefined, undefined],
					]);

					// Note: It's valid to leave the last row incomplete.
					matrix.setCells(/* row: */ 1, /* col: */ 1, /* colCount: */ 2, [1, 2, 3, 4, 5]);

					await expect([
						[undefined, undefined, undefined, undefined],
						[undefined, 1, 2, undefined],
						[undefined, 3, 4, undefined],
						[undefined, 5, undefined, undefined],
					]);
				});

				// Vet that we can set and read back the cell in a 1x1 matrix.
				it("out-of-bounds read must throw", async () => {
					// Reading cell (0,0) of an empty matrix must throw.
					assert.throws(() => {
						matrix.getCell(0, 0);
					});

					matrix.insertRows(0, 1);
					matrix.insertCols(0, 2);

					// Reading negative indices must throw.
					assert.throws(() => {
						matrix.getCell(-1, 0);
					});
					assert.throws(() => {
						matrix.getCell(0, -1);
					});

					// Reading past end of matrix must throw.
					assert.throws(() => {
						matrix.getCell(1, 0);
					});
					assert.throws(() => {
						matrix.getCell(0, 2);
					});
				});

				// Vet that we can insert a column in a 1x2 matrix.
				it("column insertion", async () => {
					matrix.insertRows(0, 1);
					matrix.insertCols(0, 2);
					await expect([[undefined, undefined]]);

					matrix.setCell(0, 0, 0);
					matrix.setCell(0, 1, 1);
					await expect([[0, 1]]);

					matrix.insertCols(1, 1);
					await expect([[0, undefined, 1]]);
				});

				// Vet that we can insert a row in a 2x1 matrix.
				it("row insertion", async () => {
					matrix.insertRows(0, 2);
					matrix.insertCols(0, 1);
					await expect([[undefined], [undefined]]);

					matrix.setCell(0, 0, 0);
					matrix.setCell(1, 0, 1);
					await expect([[0], [1]]);

					matrix.insertRows(1, 1);
					await expect([[0], [undefined], [1]]);
				});

				// Vets that the matrix correctly handles noncontiguous handles when allocating a range
				// of more than one handle.
				it("remove 1 row, insert 2 rows", async () => {
					matrix.insertRows(0, 4);
					matrix.insertCols(0, 1);
					matrix.setCells(/* row: */ 0, /* col: */ 0, /* colCount: */ 1, [0, 1, 2, 3]);
					matrix.removeRows(2, 1);
					matrix.insertRows(0, 2);
					matrix.setCells(/* row: */ 0, /* col: */ 0, /* colCount: */ 1, [84, 45]);
					await expect([[84], [45], [0], [1], [3]]);
				});

				describe("contiguous", () => {
					it("read/write 256x256", () => {
						matrix.insertRows(0, 256);
						matrix.insertCols(0, 256);
						fill(matrix, /* row: */ 0, /* col: */ 0, /* rowCount: */ 256, /* colCount: */ 256);
						check(
							matrix,
							/* row: */ 0,
							/* col: */ 0,
							/* rowCount: */ 256,
							/* colCount: */ 256,
						);
					});
				});

				describe("fragmented", () => {
					it("read/write 256x256", () => {
						insertFragmented(matrix, 256, 256);
						fill(matrix, /* row: */ 0, /* col: */ 0, /* rowCount: */ 256, /* colCount: */ 256);
						check(
							matrix,
							/* row: */ 0,
							/* col: */ 0,
							/* rowCount: */ 256,
							/* colCount: */ 256,
						);
					});
				});

				describe("summarize", () => {
					it("mutate after load", async () => {
						matrix.insertCols(0, 2);
						matrix.insertRows(0, 2);
						matrix.setCells(0, 0, 2, [0, 1, 2, 3]);

						// The 'matrix' returned by 'expect' is the result of summarizing and loading 'matrix'.
						const matrix2 = await expect([
							[0, 1],
							[2, 3],
						]);

						matrix2.insertRows(1, 1);
						assert.deepEqual(extract(matrix2), [
							[0, 1],
							[undefined, undefined],
							[2, 3],
						]);

						matrix2.setCells(1, 0, 2, [10, 11]);
						assert.deepEqual(extract(matrix2), [
							[0, 1],
							[10, 11],
							[2, 3],
						]);

						matrix2.insertCols(1, 1);
						assert.deepEqual(extract(matrix2), [
							[0, undefined, 1],
							[10, undefined, 11],
							[2, undefined, 3],
						]);
					});
				});
			});

			describe("Connected with two clients", () => {
				let matrix1: SharedMatrix;
				let matrix2: SharedMatrix;
				let consumer1: TestConsumer; // Test IMatrixConsumer that builds a copy of `matrix` via observed events.
				let consumer2: TestConsumer; // Test IMatrixConsumer that builds a copy of `matrix` via observed events.
				let containerRuntimeFactory: MockContainerRuntimeFactory;

				const expect = async (
					expected?: readonly (readonly MatrixItem<unknown>[])[],
				): Promise<void> => {
					containerRuntimeFactory.processAllMessages();

					const actual1 = extract(matrix1);
					const actual2 = extract(matrix2);

					assert.deepEqual(actual1, actual2, "matrix are not equal");

					if (expected !== undefined) {
						assert.deepEqual(actual1, expected, "matrix not as expected");
					}

					for (const consumer of [consumer1, consumer2]) {
						assert.deepEqual(
							extract(consumer),
							actual1,
							"Matrix must notify IMatrixConsumers of all changes.",
						);
					}
				};

				beforeEach("createMatrices", async () => {
					containerRuntimeFactory = new MockContainerRuntimeFactory();

					// Create the first SharedMatrix.
					matrix1 = createConnectedMatrix(
						"matrix1",
						containerRuntimeFactory,
						isSetCellPolicyFWW,
					);
					consumer1 = new TestConsumer(matrix1);

					// Create a second SharedMatrix.
					matrix2 = createConnectedMatrix(
						"matrix2",
						containerRuntimeFactory,
						isSetCellPolicyFWW,
					);
					consumer2 = new TestConsumer(matrix2);
				});

				describe("conflict", () => {
					afterEach(async () => {
						await expect();

						matrix1.closeMatrix(consumer1);
						matrix2.closeMatrix(consumer2);
					});

					it("setCell", async () => {
						matrix1.insertCols(0, 1);
						matrix1.insertRows(0, 1);
						await expect([[undefined]]);

						matrix1.setCell(0, 0, "1st");
						matrix2.setCell(0, 0, "2nd");

						await (isSetCellPolicyFWW ? expect([["1st"]]) : expect([["2nd"]]));
					});

					// Vets that clearing a cell at an unallocated row/col will locally discard
					// the an earlier remote write.
					it("clear unallocated cell", async () => {
						matrix1.insertCols(0, 1);
						matrix1.insertRows(0, 1);
						await expect([[undefined]]);

						matrix1.setCell(0, 0, "x");
						matrix2.setCell(0, 0, undefined);

						await (isSetCellPolicyFWW ? expect([["x"]]) : expect([[undefined]]));
					});

					it("insert and set in new row", async () => {
						matrix1.insertCols(0, 2);
						await expect();
						matrix1.insertRows(0, 1);
						matrix1.setCells(/* row: */ 0, /* col: */ 1, /* colCount: */ 1, ["x"]);
						await expect([[undefined, "x"]]);
					});

					it("insert and set in new col", async () => {
						matrix1.insertRows(0, 2);
						await expect([[], []]);
						matrix1.insertCols(0, 1);
						matrix1.setCells(/* row: */ 1, /* col: */ 0, /* colCount: */ 1, ["x"]);
						await expect([[undefined], ["x"]]);
					});

					it("insert col conflict", async () => {
						matrix1.insertRows(0, 1);
						await expect([[]]);

						matrix1.insertCols(0, 1);
						matrix1.setCell(0, 0, "1st");

						matrix2.insertCols(0, 1);
						matrix2.setCell(0, 0, "2nd");

						await expect([["2nd", "1st"]]);
					});

					it("insert row conflict", async () => {
						matrix1.insertCols(0, 1);
						await expect([]);

						matrix1.insertRows(0, 1);
						matrix1.setCell(0, 0, "1st");

						matrix2.insertRows(0, 1);
						matrix2.setCell(0, 0, "2nd");

						await expect([["2nd"], ["1st"]]);
					});

					it("overlapping remove col", async () => {
						matrix1.insertCols(0, 3);
						matrix1.insertRows(0, 1);
						matrix1.setCell(0, 0, "A");
						matrix1.setCell(0, 1, "B");
						matrix1.setCell(0, 2, "C");
						await expect([["A", "B", "C"]]);

						matrix1.removeCols(1, 1);
						matrix2.removeCols(1, 1);

						await expect([["A", "C"]]);
					});

					it("overlapping remove row", async () => {
						matrix1.insertCols(0, 1);
						matrix1.insertRows(0, 3);
						matrix1.setCell(0, 0, "A");
						matrix1.setCell(1, 0, "B");
						matrix1.setCell(2, 0, "C");
						await expect([["A"], ["B"], ["C"]]);

						matrix1.removeRows(1, 1);
						matrix2.removeRows(1, 1);

						await expect([["A"], ["C"]]);
					});

					it("insert col vs. remove row", async () => {
						matrix1.insertCols(0, 2);
						matrix1.insertRows(0, 3);
						matrix1.setCells(/* row: */ 0, /* col: */ 0, /* colCount: */ 2, [
							"A1",
							"C1",
							"A2",
							"C2",
							"A3",
							"C3",
						]);

						await expect([
							["A1", "C1"],
							["A2", "C2"],
							["A3", "C3"],
						]);

						matrix1.insertCols(1, 1);
						matrix1.setCells(/* row: */ 0, /* col: */ 1, /* colCount: */ 1, [
							"B1",
							"B2",
							"B3",
						]);

						matrix2.removeRows(1, 1);

						await expect([
							["A1", "B1", "C1"],
							["A3", "B3", "C3"],
						]);
					});

					it("insert row vs. remove col", async () => {
						matrix1.insertRows(0, 2);
						matrix1.insertCols(0, 3);
						matrix1.setCells(/* row: */ 0, /* col: */ 0, /* colCount: */ 3, [
							"A1",
							"B1",
							"C1",
							"A3",
							"B3",
							"C3",
						]);

						await expect([
							["A1", "B1", "C1"],
							["A3", "B3", "C3"],
						]);

						matrix1.insertRows(1, 1);
						matrix1.setCells(/* row: */ 1, /* col: */ 0, /* colCount: */ 3, [
							"A2",
							"B2",
							"C2",
						]);

						matrix2.removeCols(1, 1);

						await expect([
							["A1", "C1"],
							["A2", "C2"],
							["A3", "C3"],
						]);
					});

					it("insert row vs. remove col", async () => {
						matrix1.insertRows(0, 2);
						matrix1.insertCols(0, 3);
						matrix1.setCells(/* row: */ 0, /* col: */ 0, /* colCount: */ 3, [
							"A1",
							"B1",
							"C1",
							"A3",
							"B3",
							"C3",
						]);

						await expect([
							["A1", "B1", "C1"],
							["A3", "B3", "C3"],
						]);

						matrix1.insertRows(1, 1);
						matrix1.setCells(/* row: */ 1, /* col: */ 0, /* colCount: */ 3, [
							"A2",
							"B2",
							"C2",
						]);

						matrix2.removeCols(1, 1);

						await expect([
							["A1", "C1"],
							["A2", "C2"],
							["A3", "C3"],
						]);
					});

					// Vets that the row/col of local set operations are correctly adjusted.
					it("insert col vs. insert & remove row", async () => {
						matrix1.insertRows(0, 2);
						matrix1.insertCols(0, 2);
						matrix1.setCells(/* row: */ 0, /* col: */ 0, /* colCount: */ 2, [
							"A1",
							"C1",
							"A2",
							"C2",
						]);

						matrix1.removeRows(1, 1);
						matrix1.insertCols(1, 1);

						await expect([["A1", undefined, "C1"]]);
					});

					// Vets that the row/col of remote set operations are correctly adjusted.
					it("insert row & col vs. insert row and set", async () => {
						matrix1.insertRows(0, 4);
						matrix1.insertCols(0, 4);

						const v = Array.from({ length: 16 })
							.fill(0)
							.map((_, index) => index);

						matrix1.setCells(0, 0, 4, v);
						await expect();

						matrix1.insertRows(0, 1);
						matrix2.insertRows(0, 2);
						matrix2.setCells(/* row: */ 0, /* col: */ 0, /* colCount: */ 4, [
							"A",
							"B",
							"C",
							"D",
						]);
						matrix1.insertCols(1, 1);

						await expect();
					});

					// Vets that writes to delete handles are ignored.
					it("remove rows vs. set cells", async () => {
						matrix1.insertRows(0, 3);
						matrix1.insertCols(0, 2);
						matrix1.setCells(0, 0, 2, [0, 1, 2, 3]);

						// In order to hit the recycled handle case, ensure that the 'setCells()' below intersects
						// an empty row, which will cause the next available handle to be allocated.
						matrix2.insertRows(0, 1);
						await expect();

						matrix1.removeRows(1, 1);
						matrix2.setCells(/* row: */ 0, /* col: */ 0, /* colCount: */ 1, ["A", "B", "C"]);
						await expect();
					});

					// This case is interesting because the removal of [0..1] is split on client2 to straddle the
					// inserted "B".
					it("overlapping insert/set vs. remove/insert/set", async () => {
						matrix1.insertRows(0, 1); // rowCount: 0, colCount: 0
						matrix1.insertCols(0, 4); // rowCount: 1, colCount: 0
						matrix1.setCells(/* row: */ 0, /* col: */ 0, /* colCount: */ 4, [0, 1, 2, 3]);
						await expect([[0, 1, 2, 3]]);

						matrix2.insertCols(1, 1); // rowCount: 1, colCount: 5
						matrix2.setCells(/* row: */ 0, /* col: */ 1, /* colCount: */ 1, ["A"]);
						matrix1.removeCols(0, 2); // rowCount: 1, colCount: 2
						matrix1.insertCols(0, 1); // rowCount: 1, colCount: 3
						matrix1.setCells(/* row: */ 0, /* col: */ 0, /* colCount: */ 1, ["B"]);
						await expect([["B", "A", 2, 3]]);
					});
				});
			});

			describe("Reconnection", () => {
				let matrix1: SharedMatrix;
				let matrix2: SharedMatrix;
				let consumer1: TestConsumer; // Test IMatrixConsumer that builds a copy of `matrix` via observed events.
				let consumer2: TestConsumer; // Test IMatrixConsumer that builds a copy of `matrix` via observed events.
				let containerRuntimeFactory: MockContainerRuntimeFactoryForReconnection;
				let containerRuntime1: MockContainerRuntimeForReconnection;
				let containerRuntime2: MockContainerRuntimeForReconnection;
				let mockHandle: MockHandle<unknown>;

				const expect = async (
					expected?: readonly (readonly MatrixItem<unknown>[])[],
				): Promise<void> => {
					containerRuntimeFactory.processAllMessages();

					const actual1 = extract(matrix1);
					const actual2 = extract(matrix2);

					assert.deepEqual(actual1, actual2);

					if (expected !== undefined) {
						assert.deepEqual(actual1, expected);
					}

					for (const consumer of [consumer1, consumer2]) {
						assert.deepEqual(
							extract(consumer),
							actual1,
							"Matrix must notify IMatrixConsumers of all changes.",
						);
					}
				};

				beforeEach("createMatrices", async () => {
					containerRuntimeFactory = new MockContainerRuntimeFactoryForReconnection();

					// Create the first SharedMatrix.
					const response1 = createMatrixForReconnection(
						"matrix1",
						containerRuntimeFactory,
						isSetCellPolicyFWW,
					);
					matrix1 = response1.matrix;
					containerRuntime1 = response1.containerRuntime;
					consumer1 = new TestConsumer(matrix1);

					// Create a second SharedMatrix.
					const response2 = createMatrixForReconnection(
						"matrix2",
						containerRuntimeFactory,
						isSetCellPolicyFWW,
					);
					matrix2 = response2.matrix;
					containerRuntime2 = response2.containerRuntime;
					consumer2 = new TestConsumer(matrix2);

					mockHandle = new MockHandle({});
				});

				afterEach(async () => {
					await expect();

					matrix1.closeMatrix(consumer1);
					matrix2.closeMatrix(consumer2);
				});

				it("can resend 'setCell()' at correct position when later ops shift the original position", async () => {
					// Insert a row and a column in the first shared matrix.
					matrix1.insertRows(/* rowStart: */ 0, /* rowCount: */ 1);
					matrix1.insertCols(/* colStart: */ 0, /* colCount: */ 1);

					await expect([[undefined]]);

					matrix1.setCells(/* row: */ 0, /* col: */ 0, /* colCount: */ 1, ["A"]);

					// Note: Inserting '3' helps expose incorrect range check logic that fails to
					//       consider unallocated handles.  Consider the empty leading segment:
					//
					//           start  = -1  (unallocated)
					//           length = 3
					//           end    = -1 + 3 = 2
					//
					//       In which case, pass the empty segment into 'findReconnectionPosition()'.

					matrix1.insertCols(/* colStart: */ 0, /* colCount: */ 3);

					// Disconnect and reconnect the client.
					containerRuntime1.connected = false;
					containerRuntime1.connected = true;

					// Verify that the 'setCells()' op targeted the original position of (0,0),
					// not the current local position of (0,3).
					await expect([[undefined, undefined, undefined, "A"]]);
				});

				it("can resend 'setCell()' at correct position when multiple reconnects occur", async () => {
					// Insert a row and a column in the first shared matrix.
					matrix1.insertRows(/* rowStart: */ 0, /* rowCount: */ 1);
					matrix1.insertCols(/* colStart: */ 0, /* colCount: */ 1);

					await expect([[undefined]]);

					matrix1.setCells(/* row: */ 0, /* col: */ 0, /* colCount: */ 1, ["A"]);

					// Note: Inserting '3' helps expose incorrect range check logic that fails to
					//       consider unallocated handles.  Consider the empty leading segment:
					//
					//           start  = -1  (unallocated)
					//           length = 3
					//           end    = -1 + 3 = 2
					//
					//       In which case, pass the empty segment into 'findReconnectionPostilion()'.

					matrix1.insertCols(/* colStart: */ 0, /* colCount: */ 3);

					// Disconnect and reconnect the client.
					containerRuntime1.connected = false;
					containerRuntime1.connected = true;

					// Disconnect and reconnect the client a second time to catch bugs caused by not preserving
					// the original 'localSeq' or caused by state mutations during reconnection.
					containerRuntime1.connected = false;
					containerRuntime1.connected = true;

					// Verify that the 'setCells()' op targeted the original position of (0,0),
					// not the current local position of (0,3).
					await expect([[undefined, undefined, undefined, "A"]]);
				});

				it("can resend unacked ops on reconnection", async () => {
					// Insert a row and a column in the first shared matrix.
					matrix1.insertCols(0, 1);
					matrix1.insertRows(0, 1);

					// Disconnect and reconnect the first client.
					containerRuntime1.connected = false;
					containerRuntime1.connected = true;

					// Verify that both the matrices have expected content.
					await expect([[undefined]]);

					// Set a cell in the second shared matrix.
					matrix2.setCell(0, 0, "2nd");

					// Disconnect and reconnect the second client.
					containerRuntime2.connected = false;
					containerRuntime2.connected = true;

					// Verify that both the matrices have expected content.
					await expect([["2nd"]]);
				});

				it("can store ops in disconnected state and resend them on reconnection", async () => {
					// Disconnect the first client.
					containerRuntime1.connected = false;

					// Insert a row and a column in the first shared matrix.
					matrix1.insertCols(0, 1);
					matrix1.insertRows(0, 1);

					// Reconnect the first client.
					containerRuntime1.connected = true;

					// Verify that both the matrices have expected content.
					await expect([[undefined]]);

					// Disconnect the second client.
					containerRuntime2.connected = false;

					// Set a cell in the second shared matrix.
					matrix2.setCell(0, 0, "2nd");

					// Reconnect the second client.
					containerRuntime2.connected = true;

					// Verify that both the matrices have expected content.
					await expect([["2nd"]]);
				});

				it("setCell(IFluidHandle) is preserved when resubmitted", async () => {
					// Disconnect the first client.
					containerRuntime1.connected = false;

					matrix1.insertCols(0, 1);
					matrix1.insertRows(0, 1);
					matrix1.setCell(0, 0, mockHandle);

					// Reconnect the second client.
					containerRuntime1.connected = true;

					// Note: We cannot 'deepEquals' bound Fluid handles, and therefore cannot use our
					//       'expect()' helper here.  Instead, we 'processAllMessages()' and then compare
					//       the relevant fields of IFluidHandle.

					containerRuntimeFactory.processAllMessages();

					const handle1 = matrix1.getCell(0, 0) as IFluidHandleInternal;
					const handle2 = matrix2.getCell(0, 0) as IFluidHandleInternal;

					assert.equal(handle1.absolutePath, handle2.absolutePath);

					// Remove handle from matrix to prevent the convergence sanity checks in 'afterEach()'
					// from performing a 'deepEquals' on the matrix contents.
					matrix1.setCell(0, 0, undefined);
				});

				it("resubmission omits writes to recycled row/col handles", async () => {
					matrix1.insertRows(0, 2);
					matrix1.insertCols(0, 2);
					matrix1.setCells(/* row: */ 0, /* col: */ 0, /* colCount: */ 2, [0, 1, 2, 3]);
					matrix1.removeRows(1, 1);

					containerRuntime1.connected = false;

					matrix1.insertRows(0, 1);
					matrix1.setCells(/* row: */ 0, /* col: */ 0, /* colCount: */ 2, [28, 49]);

					containerRuntime1.connected = true;

					await expect([
						[28, 49],
						[0, 1],
					]);
				});

				it("omits not-yet-locally deleted row/cols during resubmission", async () => {
					matrix1.insertRows(/* rowStart: */ 0, /* rowCount: */ 2);
					matrix1.insertCols(/* colStart: */ 0, /* colCount: */ 4);
					matrix1.setCells(
						/* row: */ 0,
						/* col: */ 0,
						/* colCount: */ 4,
						[0, 1, 2, 3, 4, 5, 6, 7],
					);

					matrix1.insertRows(/* rowStart: */ 0, /* rowCount: */ 1);
					matrix1.setCells(/* row: */ 0, /* col: */ 0, /* colCount: */ 4, [61, 57, 7, 62]);

					containerRuntime1.connected = false;
					containerRuntime1.connected = true;

					await expect([
						[61, 57, 7, 62],
						[0, 1, 2, 3],
						[4, 5, 6, 7],
					]);

					matrix1.setCells(/* row: */ 2, /* col: */ 3, /* colCount: */ 1, [65]);
					containerRuntime1.connected = false;

					matrix1.removeRows(/* rowStart: */ 0, /* rowCount: */ 1);
					containerRuntime1.connected = true;

					await expect([
						[0, 1, 2, 3],
						[4, 5, 6, 65],
					]);
				});

				it("resets row/col handles for resubmitted ops", async () => {
					matrix1.insertRows(/* rowStart: */ 0, /* rowCount: */ 1);
					matrix1.insertCols(/* colStart: */ 0, /* colCount: */ 1);
					matrix1.setCells(/* row: */ 0, /* col: */ 0, /* colCount: */ 1, [0]);

					matrix2.insertCols(/* colStart: */ 0, /* colCount: */ 1);
					matrix2.insertRows(/* rowStart: */ 0, /* rowCount: */ 1);
					matrix2.setCells(/* row: */ 0, /* col: */ 0, /* colCount: */ 1, [90]);

					// When resubmitting insert ops, ensure that the receiving clients allocate
					// new row/col handles for their local storage.
					containerRuntime2.connected = false;
					containerRuntime2.connected = true;

					await expect([
						[90, undefined],
						[undefined, 0],
					]);
				});
			});

			describe("Doesn't leave dangling row/col reference positions", () => {
				type MatrixWithDimensions = Omit<SharedMatrix, "rows" | "cols"> & {
					rows: PermutationVector;
					cols: PermutationVector;
				};

				function findVectorReferenceCount(vector: PermutationVector): number {
					let count = 0;
					vector.walkSegments((segment: ISegmentInternal) => {
						count += [...(segment.localRefs ?? [])].length;
						return true;
					});
					return count;
				}

				function findTotalReferenceCount(matrix: ISharedMatrix): {
					rows: number;
					cols: number;
				} {
					const matrixWithDimensions = matrix as unknown as MatrixWithDimensions;
					assert(
						matrixWithDimensions.rows !== undefined,
						"Expected matrix to have rows property",
					);
					assert(
						matrixWithDimensions.cols !== undefined,
						"Expected matrix to have cols property",
					);

					return {
						rows: findVectorReferenceCount(matrixWithDimensions.rows),
						cols: findVectorReferenceCount(matrixWithDimensions.cols),
					};
				}

				it("made while detached", () => {
					const matrix = createLocalMatrix("A");
					matrix.insertRows(0, 2);
					matrix.insertCols(0, 2);
					matrix.setCell(0, 0, "val");
					assert.deepEqual(findTotalReferenceCount(matrix), { rows: 0, cols: 0 });
				});

				it("after first submission ack", () => {
					const containerRuntimeFactory = new MockContainerRuntimeFactory();
					const matrix = createConnectedMatrix(
						"A",
						containerRuntimeFactory,
						isSetCellPolicyFWW,
					);

					matrix.insertRows(0, 2);
					matrix.insertCols(0, 2);
					containerRuntimeFactory.processAllMessages();
					matrix.setCell(0, 0, "val");

					assert.deepEqual(findTotalReferenceCount(matrix), { rows: 1, cols: 1 });

					containerRuntimeFactory.processAllMessages();

					assert.deepEqual(findTotalReferenceCount(matrix), { rows: 0, cols: 0 });
				});

				it("after resubmitted ack", () => {
					const containerRuntimeFactory = new MockContainerRuntimeFactoryForReconnection();
					const dataStoreRuntime = new MockFluidDataStoreRuntime();
					const matrix = matrixFactory.create(dataStoreRuntime, "A");
					if (isSetCellPolicyFWW) {
						matrix.switchSetCellPolicy();
					}
					const containerRuntime =
						containerRuntimeFactory.createContainerRuntime(dataStoreRuntime);
					matrix.connect({
						deltaConnection: dataStoreRuntime.createDeltaConnection(),
						objectStorage: new MockStorage(),
					});

					matrix.insertRows(0, 2);
					matrix.insertCols(0, 2);
					containerRuntimeFactory.processAllMessages();

					containerRuntime.connected = false;
					matrix.setCell(0, 0, "val");

					assert.deepEqual(findTotalReferenceCount(matrix), { rows: 1, cols: 1 });
					containerRuntime.connected = true;
					assert.deepEqual(findTotalReferenceCount(matrix), { rows: 1, cols: 1 });

					containerRuntimeFactory.processAllMessages();

					assert.deepEqual(findTotalReferenceCount(matrix), { rows: 0, cols: 0 });
				});
			});

			describe("Garbage Collection", () => {
				class GCSharedMatrixProvider implements IGCTestProvider {
					private colCount = 0;
					private subMatrixCount = 0;
					private _expectedRoutes: string[] = [];
					// The GC test harness requires a SharedObject, not just ISharedObject.
					private readonly matrix1: SharedMatrixClass;
					private readonly matrix2: SharedMatrixClass;
					private readonly containerRuntimeFactory: MockContainerRuntimeFactory;

					constructor() {
						this.containerRuntimeFactory = new MockContainerRuntimeFactory();
						const matrix1 = createConnectedMatrix(
							"matrix1",
							this.containerRuntimeFactory,
							isSetCellPolicyFWW,
						);
						assert(matrix1 instanceof SharedMatrixClass);
						this.matrix1 = matrix1;
						const matrix2 = createConnectedMatrix(
							"matrix2",
							this.containerRuntimeFactory,
							isSetCellPolicyFWW,
						);
						assert(matrix2 instanceof SharedMatrixClass);
						this.matrix2 = matrix2;
						// Insert a row into the matrix where we will set cells.
						this.matrix1.insertRows(0, 1);
					}

					public get sharedObject(): SharedMatrixClass {
						// Return the remote SharedMatrix because we want to verify its summary data.
						return this.matrix2;
					}

					public get expectedOutboundRoutes(): string[] {
						return this._expectedRoutes;
					}

					public async addOutboundRoutes(): Promise<void> {
						const newSubMatrixId = `subMatrix-${++this.subMatrixCount}`;
						const subMatrix = createLocalMatrix(newSubMatrixId);

						this.matrix1.insertCols(this.colCount, 1);
						this.matrix1.setCell(0, this.colCount, subMatrix.handle);
						this.colCount++;
						this._expectedRoutes.push(subMatrix.handle.absolutePath);
						this.containerRuntimeFactory.processAllMessages();
					}

					public async deleteOutboundRoutes(): Promise<void> {
						// Delete the last handle that was added.
						const lastAddedCol = this.colCount - 1;
						const deletedHandle = this.matrix1.getCell(
							0,
							lastAddedCol,
						) as IFluidHandleInternal;
						assert(deletedHandle, "Route must be added before deleting");

						this.matrix1.setCell(0, lastAddedCol, undefined);
						// Remove deleted handle's route from expected routes.
						this._expectedRoutes = this._expectedRoutes.filter(
							(route) => route !== deletedHandle.absolutePath,
						);
						this.containerRuntimeFactory.processAllMessages();
					}

					public async addNestedHandles(): Promise<void> {
						const subMatrix = createLocalMatrix(`subMatrix-${++this.subMatrixCount}`);
						const subMatrix2 = createLocalMatrix(`subMatrix-${++this.subMatrixCount}`);
						const containingObject = {
							subMatrixHandle: subMatrix.handle,
							nestedObj: {
								subMatrix2Handle: subMatrix2.handle,
							},
						};

						this.matrix1.insertCols(this.colCount, 1);
						this.matrix1.setCell(0, this.colCount, containingObject);
						this.colCount++;
						this._expectedRoutes.push(
							subMatrix.handle.absolutePath,
							subMatrix2.handle.absolutePath,
						);
						this.containerRuntimeFactory.processAllMessages();
					}
				}

				runGCTests(GCSharedMatrixProvider);
			});

			describe("inserting and deleting many cells", () => {
				it("is connected", () => {
					const matrix = createConnectedMatrix(
						"foo",
						new MockContainerRuntimeFactory(),
						isSetCellPolicyFWW,
					);

					for (let i = 0; i < 10_000; i++) {
						matrix.insertCols(0, 1);
						matrix.insertRows(0, 1);
						matrix.removeCols(0, 1);
						matrix.removeRows(0, 1);
					}
				});

				it("is disconnected", () => {
					const matrix = matrixFactory.create(new MockFluidDataStoreRuntime(), "matrix1");
					if (isSetCellPolicyFWW) {
						matrix.switchSetCellPolicy();
					}

					for (let i = 0; i <= 10_000; i++) {
						matrix.insertCols(0, 1);
						matrix.insertRows(0, 1);
						matrix.removeCols(0, 1);
						matrix.removeRows(0, 1);
					}
				});
			});
		});
	}

	describe("Switch Policy Tests from LWW -> FWW", () => {
		describe("Reconnection", () => {
			let matrix1: SharedMatrix;
			let matrix2: SharedMatrix;
			let consumer1: TestConsumer; // Test IMatrixConsumer that builds a copy of `matrix` via observed events.
			let consumer2: TestConsumer; // Test IMatrixConsumer that builds a copy of `matrix` via observed events.
			let containerRuntimeFactory: MockContainerRuntimeFactoryForReconnection;
			let containerRuntime1: MockContainerRuntimeForReconnection;
			let containerRuntime2: MockContainerRuntimeForReconnection;

			const expect = async (
				expected?: readonly (readonly MatrixItem<unknown>[])[],
				extraClient?: { matrix: SharedMatrix; consumer: TestConsumer }[],
			): Promise<void> => {
				containerRuntimeFactory.processAllMessages();

				const actual1 = extract(matrix1);
				const actual2 = extract(matrix2);

				assert.deepEqual(actual1, actual2, "2 matrix are not equal");

				if (expected !== undefined) {
					assert.deepEqual(actual1, expected, "matrix not as expected");
				}

				const consumers = [consumer1, consumer2];
				if (extraClient !== undefined) {
					for (const client of extraClient) {
						consumers.push(client.consumer);
					}
				}
				for (const consumer of consumers) {
					assert.deepEqual(
						extract(consumer),
						actual1,
						"Matrix must notify IMatrixConsumers of all changes.",
					);
				}
			};

			async function getNewClient<T>(matrix: SharedMatrix<T>): Promise<{
				matrix: SharedMatrix;
				containerRuntime: MockContainerRuntimeForReconnection;
				consumer: TestConsumer;
			}> {
				// Create a summary
				const objectStorage = MockStorage.createFromSummary(matrix.getAttachSummary().summary);

				const dataStoreRuntime = new MockFluidDataStoreRuntime();
				const containerRuntime =
					containerRuntimeFactory.createContainerRuntime(dataStoreRuntime);

				// Load the summary into a newly created 2nd SharedMatrix.
				const services: IChannelServices = {
					deltaConnection: dataStoreRuntime.createDeltaConnection(),
					objectStorage,
				};
				const matrix2 = await matrixFactory.load(
					dataStoreRuntime,
					`load(${matrix.id})`,
					services,
					matrixFactory.attributes,
				);

				const consumer = new TestConsumer(matrix2);
				return { matrix: matrix2, containerRuntime, consumer };
			}

			beforeEach("createMatrices", async () => {
				containerRuntimeFactory = new MockContainerRuntimeFactoryForReconnection();

				// Create the first SharedMatrix.
				const response1 = createMatrixForReconnection(
					"matrix1",
					containerRuntimeFactory,
					false,
				);
				matrix1 = response1.matrix;
				containerRuntime1 = response1.containerRuntime;
				consumer1 = new TestConsumer(matrix1);

				// Create a second SharedMatrix.
				const response2 = createMatrixForReconnection(
					"matrix2",
					containerRuntimeFactory,
					false,
				);
				matrix2 = response2.matrix;
				containerRuntime2 = response2.containerRuntime;
				consumer2 = new TestConsumer(matrix2);
			});

			afterEach(async () => {
				await expect();

				matrix1.closeMatrix(consumer1);
				matrix2.closeMatrix(consumer2);
			});

			const switchPolicy = (matrix: SharedMatrix): void => {
				matrix.switchSetCellPolicy();
			};

			it("Loser gets the conflict event in case of race condition", async () => {
				// Insert a row and a column in the first shared matrix.
				matrix1.insertRows(/* rowStart: */ 0, /* rowCount: */ 1);
				matrix1.insertCols(/* colStart: */ 0, /* colCount: */ 2);

				await expect([[undefined, undefined]]);
				switchPolicy(matrix1);

				let eventRaised = false;
				matrix2.on("conflict", (row, col, currentVal, rejectedVal, instance) => {
					assert(row === 0, "row should be correct");
					assert(col === 0, "col should be correct");
					assert(currentVal === "A", "currentVal should be correct");
					assert(rejectedVal === "B", "rejectedVal should be correct");
					assert(instance.id === "matrix2", "matrix should be correct");
					eventRaised = true;
				});

				// Disconnect the client.
				containerRuntime1.connected = false;
				containerRuntime2.connected = false;

				matrix1.setCells(/* row: */ 0, /* col: */ 0, /* colCount: */ 1, ["A"]);
				matrix2.setCells(/* row: */ 0, /* col: */ 0, /* colCount: */ 1, ["B"]);

				matrix2.setCells(0, 1, 1, ["C"]);
				containerRuntime1.connected = true;
				containerRuntime2.connected = true;

				await expect([["A", "C"]]);
				assert(eventRaised, "conflict event should be raised");
			});

			it("Client should behave as FWW if op refSeqNum < Policy switch op seqNum but locally it was changed for that client", async () => {
				// Insert a row and a column in the first shared matrix.
				matrix1.insertRows(/* rowStart: */ 0, /* rowCount: */ 1);
				matrix1.insertCols(/* colStart: */ 0, /* colCount: */ 1);

				await expect([[undefined]]);
				switchPolicy(matrix1);

				// Disconnect the client.
				containerRuntime1.connected = false;
				containerRuntime2.connected = false;

				matrix1.setCells(/* row: */ 0, /* col: */ 0, /* colCount: */ 1, ["A"]);
				matrix2.setCells(/* row: */ 0, /* col: */ 0, /* colCount: */ 1, ["B"]);

				containerRuntime1.connected = true;
				containerRuntime2.connected = true;

				await expect([["A"]]);
			});

			it("Client Should be able to overwrite", async () => {
				// Insert a row and a column in the first shared matrix.
				matrix1.insertRows(/* rowStart: */ 0, /* rowCount: */ 1);
				matrix1.insertCols(/* colStart: */ 0, /* colCount: */ 1);

				await expect([[undefined]]);
				switchPolicy(matrix1);

				matrix1.setCells(/* row: */ 0, /* col: */ 0, /* colCount: */ 1, ["A"]);

				await expect([["A"]]);
				// Now all the messages are synced, so they client should be able to overwrite the last val.
				matrix2.setCells(/* row: */ 0, /* col: */ 0, /* colCount: */ 1, ["B"]);

				await expect([["B"]]);
			});

			it("Client should get the conflict event in case of resubmitting pending ops if the cell is modified during catchup", async () => {
				// Insert a row and a column in the first shared matrix.
				matrix1.insertRows(/* rowStart: */ 0, /* rowCount: */ 1);
				matrix1.insertCols(/* colStart: */ 0, /* colCount: */ 1);

				await expect([[undefined]]);
				switchPolicy(matrix1);

				let eventRaised = false;
				matrix2.on("conflict", (row, col, currentVal, rejectedVal, instance) => {
					assert(row === 0, "row should be correct");
					assert(col === 0, "col should be correct");
					assert(currentVal === "A", "currentVal should be correct");
					assert(rejectedVal === "B", "rejectedVal should be correct");
					assert(instance.id === "matrix2", "matrix should be correct");
					eventRaised = true;
				});

				// Disconnect the client.
				containerRuntime2.connected = false;

				matrix1.setCells(/* row: */ 0, /* col: */ 0, /* colCount: */ 1, ["A"]);
				matrix2.setCells(/* row: */ 0, /* col: */ 0, /* colCount: */ 1, ["B"]);

				containerRuntime2.connected = true;

				await expect([["A"]]);
				assert(eventRaised, "conflict event should be raised");
			});

			it("Client should send the op in case of resubmitting pending ops if the cell is modified by same client and policy modified during catchup", async () => {
				// Insert a row and a column in the first shared matrix.
				matrix1.insertRows(/* rowStart: */ 0, /* rowCount: */ 1);
				matrix1.insertCols(/* colStart: */ 0, /* colCount: */ 1);

				await expect([[undefined]]);
				switchPolicy(matrix1);
				matrix2.setCells(/* row: */ 0, /* col: */ 0, /* colCount: */ 1, ["A"]);

				// Disconnect the client.
				containerRuntime2.connected = false;

				matrix2.setCells(/* row: */ 0, /* col: */ 0, /* colCount: */ 1, ["B"]);

				containerRuntime2.connected = true;

				await expect([["B"]]);
			});

			it("Client should switch to FWW after policy is switched", async () => {
				// Insert a row and a column in the first shared matrix.
				matrix1.insertCols(0, 1);
				matrix1.insertRows(0, 1);
				// Verify that both the matrices have expected content.
				await expect([[undefined]]);

				// Disconnect the client.
				containerRuntime1.connected = false;
				containerRuntime2.connected = false;

				matrix1.setCell(0, 0, "1st");
				matrix2.setCell(0, 0, "2nd");

				// Reconnect the client.
				containerRuntime1.connected = true;
				containerRuntime2.connected = true;

				// Verify that both the matrices have expected content.
				await expect([["2nd"]]);

				// Now switch the Policy
				switchPolicy(matrix1);

				// Disconnect the client.
				containerRuntime1.connected = false;
				containerRuntime2.connected = false;

				matrix1.setCell(0, 0, "3rd");
				matrix2.setCell(0, 0, "4th");

				// Reconnect the client.
				containerRuntime1.connected = true;
				containerRuntime2.connected = true;

				// Verify that both the matrices have expected content.
				await expect([["3rd"]]);
			});

			it("Client should behave correctly when policy is switched to FWW during disconnected state and cell set by same client who switched the policy", async () => {
				// Insert a row and a column in the first shared matrix.
				matrix1.insertCols(0, 1);
				matrix1.insertRows(0, 1);
				// Verify that both the matrices have expected content.
				await expect([[undefined]]);

				// Disconnect the client.
				containerRuntime1.connected = false;
				containerRuntime2.connected = false;

				matrix1.setCell(0, 0, "1st");
				matrix2.setCell(0, 0, "2nd");

				// Now switch the Policy
				switchPolicy(matrix2);

				matrix1.setCell(0, 0, "3rd");
				matrix2.setCell(0, 0, "4th");

				// Reconnect the client.
				containerRuntime1.connected = true;
				containerRuntime2.connected = true;
				// Verify that both the matrices have expected content. Matrix2 switched the policy and also made the set op, so it should be set.
				await expect([["4th"]]);
			});

			it("Client should behave correctly when policy is switched to FWW during disconnected state and cell set by other client", async () => {
				// Insert a row and a column in the first shared matrix.
				matrix1.insertCols(0, 1);
				matrix1.insertRows(0, 1);
				// Verify that both the matrices have expected content.
				await expect([[undefined]]);

				let eventRaisedCount = 0;
				matrix2.on("conflict", (row, col, currentVal, rejectedVal, instance) => {
					assert(row === 0, "row should be correct");
					assert(col === 0, "col should be correct");
					assert(
						currentVal === (eventRaisedCount === 0 ? "1st" : "3rd"),
						"currentVal should be correct",
					);
					assert(
						rejectedVal === (eventRaisedCount === 0 ? "4th" : "1st"),
						"rejectedVal should be correct",
					);
					assert(instance.id === "matrix2", "matrix should be correct");
					eventRaisedCount++;
				});

				// Disconnect the client.
				containerRuntime1.connected = false;
				containerRuntime2.connected = false;

				matrix1.setCell(0, 0, "1st");
				matrix2.setCell(0, 0, "2nd");

				// Now switch the Policy
				switchPolicy(matrix1);

				matrix1.setCell(0, 0, "3rd");
				matrix2.setCell(0, 0, "4th");

				// Reconnect the client.
				containerRuntime1.connected = true;
				containerRuntime2.connected = true;
				// Verify that both the matrices have expected content.
				await expect([["3rd"]]);
				assert(eventRaisedCount === 2, "conflict event should have been raised");
			});

			it("Client should get multiple conflict till its latest pending is received", async () => {
				// Insert a row and a column in the first shared matrix.
				matrix1.insertCols(0, 1);
				matrix1.insertRows(0, 1);
				// Verify that both the matrices have expected content.
				await expect([[undefined]]);

				let eventRaisedCount = 0;
				matrix2.on("conflict", (row, col, currentVal, rejectedVal, instance) => {
					assert(row === 0, "row should be correct");
					assert(col === 0, "col should be correct");
					assert(instance.id === "matrix2", "matrix should be correct");
					eventRaisedCount++;
				});

				// Now switch the Policy
				switchPolicy(matrix1);

				matrix1.setCell(0, 0, "1st");
				matrix2.setCell(0, 0, "2nd");
				matrix1.setCell(0, 0, "3rd");
				matrix2.setCell(0, 0, "4th");
				containerRuntimeFactory.processAllMessages();
				matrix1.setCell(0, 0, "5th");

				// Verify that both the matrices have expected content.
				await expect([["5th"]]);
				assert(eventRaisedCount === 2, "conflict event should have been raised");
			});

			it("Client should send op and also apply when policy is switched to FWW but no op is sent to notify", async () => {
				// Insert a row and a column in the first shared matrix.
				matrix1.insertCols(0, 1);
				matrix1.insertRows(0, 1);
				// Verify that both the matrices have expected content.
				await expect([[undefined]]);

				// Disconnect the client.
				containerRuntime2.connected = false;

				matrix1.setCell(0, 0, "1st");
				containerRuntimeFactory.processOneMessage();
				// Disconnect the client.
				containerRuntime1.connected = false;

				// Now switch the Policy
				switchPolicy(matrix1);

				// Policy is not switched as the op is not received yet. So we should send this op and also apply later.
				matrix2.setCell(0, 0, "4th");

				// Reconnect the client.
				containerRuntime1.connected = true;
				containerRuntime2.connected = true;

				// Verify that both the matrices have expected content.
				await expect([["4th"]]);
			});

			it("Client should behave as LWW if op refSeqNum < Policy switch op seqNum and policy is switched by different client which didn't send op to notify", async () => {
				// Insert a row and a column in the first shared matrix.
				matrix1.insertRows(/* rowStart: */ 0, /* rowCount: */ 1);
				matrix1.insertCols(/* colStart: */ 0, /* colCount: */ 1);
				await expect([[undefined]]);

				matrix2.setCells(/* row: */ 0, /* col: */ 0, /* colCount: */ 1, ["B"]);
				containerRuntimeFactory.processAllMessages();
				await expect([["B"]]);

				switchPolicy(matrix1);

				matrix2.setCells(/* row: */ 0, /* col: */ 0, /* colCount: */ 1, ["A"]);

				// Should still behave as LWW as ref seq number of ops < switch policy seq number
				await expect([["A"]]);
			});

			it("Client racing to switch policy", async () => {
				// Insert a row and a column in the first shared matrix.
				matrix1.insertRows(/* rowStart: */ 0, /* rowCount: */ 1);
				matrix1.insertCols(/* colStart: */ 0, /* colCount: */ 1);
				await expect([[undefined]]);

				matrix2.setCells(/* row: */ 0, /* col: */ 0, /* colCount: */ 1, ["B"]);
				containerRuntimeFactory.processAllMessages();
				await expect([["B"]]);

				switchPolicy(matrix1);
				switchPolicy(matrix2);

				matrix1.setCells(/* row: */ 0, /* col: */ 0, /* colCount: */ 1, ["A"]);
				matrix2.setCells(/* row: */ 0, /* col: */ 0, /* colCount: */ 1, ["C"]);

				// Should still behave as LWW as ref seq number of ops < switch policy seq number
				await expect([["A"]]);

				matrix1.setCells(/* row: */ 0, /* col: */ 0, /* colCount: */ 1, ["D"]);
				matrix2.setCells(/* row: */ 0, /* col: */ 0, /* colCount: */ 1, ["E"]);

				// Should not behave as FWW in case of conflict.
				await expect([["D"]]);
			});

			it("client should not submit op in FWW mode when the cell is already deleted", async () => {
				// Insert a row and a column in the first shared matrix.
				matrix1.insertRows(/* rowStart: */ 0, /* rowCount: */ 2);
				matrix1.insertCols(/* colStart: */ 0, /* colCount: */ 2);
				matrix1.setCells(/* row: */ 1, /* col: */ 1, /* colCount: */ 1, ["A"]);

				await expect([
					[undefined, undefined],
					[undefined, "A"],
				]);

				switchPolicy(matrix1);

				containerRuntime1.connected = false;
				matrix1.setCells(/* row: */ 1, /* col: */ 1, /* colCount: */ 1, ["B"]);

				// Remove the cell. Matrix should not produce op for the same.
				matrix2.removeCols(1, 1);

				containerRuntime1.connected = true;

				await expect([[undefined], [undefined]]);

				containerRuntime1.connected = false;
				matrix1.setCells(/* row: */ 1, /* col: */ 0, /* colCount: */ 1, ["C"]);
				// Remove the cell and then insert same cell again. Matrix should not produce op for the same.
				matrix2.removeRows(1, 1);
				matrix2.insertRows(1, 1);
				containerRuntime1.connected = true;
				await expect([[undefined], [undefined]]);
			});

			it("Winner op in FWW is made before summary and loser op is sequenced after summary, second op is rejected due to FWW", async () => {
				// Insert a row and a column in the first shared matrix.
				matrix1.insertRows(/* rowStart: */ 0, /* rowCount: */ 1);
				matrix1.insertCols(/* colStart: */ 0, /* colCount: */ 1);
				await expect([[undefined]]);

				switchPolicy(matrix1);
				matrix1.setCells(/* row: */ 0, /* col: */ 0, /* colCount: */ 1, ["A"]);
				matrix2.setCells(/* row: */ 0, /* col: */ 0, /* colCount: */ 1, ["B"]);
				containerRuntimeFactory.processOneMessage();
				// Load another client in between processing of second op and see that it treats
				// second set op as FWW and rejects it.
				const newClient = await getNewClient(matrix1);
				newClient.containerRuntime.connected = true;

				containerRuntimeFactory.processAllMessages();
				await expect([["A"]], [{ ...newClient }]);
			});

			it("New client loads from summary made in LWW mode and immediately starts following the new policy when switched", async () => {
				// Insert a row and a column in the first shared matrix.
				matrix1.insertRows(/* rowStart: */ 0, /* rowCount: */ 1);
				matrix1.insertCols(/* colStart: */ 0, /* colCount: */ 1);
				await expect([[undefined]]);

				matrix1.setCells(/* row: */ 0, /* col: */ 0, /* colCount: */ 1, ["A"]);
				containerRuntimeFactory.processAllMessages();

				const newClient = await getNewClient(matrix1);
				newClient.containerRuntime.connected = true;

				switchPolicy(matrix1);
				matrix1.setCells(/* row: */ 0, /* col: */ 0, /* colCount: */ 1, ["B"]);
				matrix1.setCells(/* row: */ 0, /* col: */ 0, /* colCount: */ 1, ["C"]);
				matrix2.setCells(/* row: */ 0, /* col: */ 0, /* colCount: */ 1, ["C1"]);
				await expect([["C"]], [{ ...newClient }]);

				matrix1.setCells(/* row: */ 0, /* col: */ 0, /* colCount: */ 1, ["D"]);
				matrix2.setCells(/* row: */ 0, /* col: */ 0, /* colCount: */ 1, ["E"]);

				await expect([["D"]], [{ ...newClient }]);
			});

			it("Client switching policy should avoid changes from other client in case pending change is present, otherwise apply remote op", async () => {
				// Insert a row and a column in the first shared matrix.
				matrix1.insertRows(/* rowStart: */ 0, /* rowCount: */ 1);
				matrix1.insertCols(/* colStart: */ 0, /* colCount: */ 2);
				await expect([[undefined, undefined]]);

				switchPolicy(matrix1);
				matrix1.setCells(/* row: */ 0, /* col: */ 0, /* colCount: */ 1, ["B"]);
				matrix2.setCells(/* row: */ 0, /* col: */ 0, /* colCount: */ 1, ["C"]);
				matrix2.setCells(/* row: */ 0, /* col: */ 1, /* colCount: */ 1, ["C1"]);
				await expect([["B", "C1"]]);

				matrix1.setCells(/* row: */ 0, /* col: */ 0, /* colCount: */ 1, ["D"]);
				matrix2.setCells(/* row: */ 0, /* col: */ 0, /* colCount: */ 1, ["E"]);
				matrix2.setCells(/* row: */ 0, /* col: */ 1, /* colCount: */ 1, ["D"]);
				matrix1.setCells(/* row: */ 0, /* col: */ 1, /* colCount: */ 1, ["E"]);
				await expect([["D", "D"]]);
			});
		});
	});
});
