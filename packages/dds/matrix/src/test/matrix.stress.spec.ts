/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { IChannelServices } from "@fluidframework/datastore-definitions/internal";
import {
	MockContainerRuntimeFactoryForReconnection,
	MockContainerRuntimeForReconnection,
	MockFluidDataStoreRuntime,
	MockStorage,
} from "@fluidframework/test-runtime-utils/internal";
import { Random } from "best-random";

import { SharedMatrix, type MatrixItem } from "../index.js";
import { SharedMatrix as SharedMatrixClass } from "../matrix.js";

import { UndoRedoStackManager } from "./undoRedoStackManager.js";
import { expectSize, extract, matrixFactory } from "./utils.js";

/**
 * 0 means use LWW.
 * 2 means use LWW and then switch to FWW.
 */
for (const isSetCellPolicyFWW of [0, 2]) {
	describe(`Matrix isSetCellPolicyFWW=${isSetCellPolicyFWW}`, () => {
		describe("stress", () => {
			let containerRuntimeFactory: MockContainerRuntimeFactoryForReconnection;
			let matrices: SharedMatrix[]; // Array of matrices under test
			let runtimes: MockContainerRuntimeForReconnection[] = [];
			let trace: string[]; // Repro steps to be printed if a failure is encountered.
			let matrixTrace: string[];

			const logMatrix = (matrix: SharedMatrix): void => {
				// This avoids @typescript-eslint/no-base-to-string.
				assert(matrix instanceof SharedMatrixClass);
				matrixTrace.push(matrix.toString());
			};

			/**
			 * Drains the queue of pending ops for each client and vets that all matrices converged on the same state.
			 */
			const expect = async (): Promise<void> => {
				// Reconnect any disconnected clients before processing pending ops.
				for (let matrixIndex = 0; matrixIndex < runtimes.length; matrixIndex++) {
					const runtime = runtimes[matrixIndex];
					if (!runtime.connected) {
						trace?.push(`containerRuntime${matrixIndex + 1}.connected = true;`);
						runtime.connected = true;
					}
				}

				// Broadcast and process all pending messages across all matrices.
				trace?.push("await expect();");
				containerRuntimeFactory.processAllMessages();

				// Verify that all matrices have converged on the same final state.
				const matrix0 = matrices[0];
				const actual0 = extract(matrix0);

				for (let i = 1; i < matrices.length; i++) {
					const matrixN = matrices[i];
					const actualN = extract(matrixN);
					assert.deepEqual(actual0, actualN);

					// Vet that empty matrices have identical dimensions (see notes on `expectSize`).
					expectSize(matrixN, matrix0.rowCount, matrix0.colCount);
				}
			};

			/**
			 * Performs a stress run using the given parameters.
			 *
			 * 'syncProbability' is the probability that the clients will drain their queue of incoming messages
			 * and check for convergence.
			 *
			 * 'disconnectProbability' is the probability that a client will disconnect, forcing it to regenerate
			 * and resubmit any pending local operations on the next sync.
			 *
			 * 'seed' is the 32-bit integer used to seed the PRNG.
			 */
			async function stress(
				numClients: number,
				numOps: number,
				syncProbability: number,
				disconnectProbability: number,
				undoProbability: number,
				switchProbability: number,
				newClientJoinProbability: number,
				seed: number,
				maxRows?: number,
				maxCols?: number,
				maxClients?: number,
			): Promise<void> {
				try {
					matrices = [];
					runtimes = [];
					trace = [];
					matrixTrace = [];

					const undoRedoStacks: UndoRedoStackManager[] | undefined =
						undoProbability === 0 ? undefined : [];

					containerRuntimeFactory = new MockContainerRuntimeFactoryForReconnection();
					let summarizer: SharedMatrix | undefined;

					// Summarizes the given `SharedMatrix`, loads the summarize into a 2nd SharedMatrix, vets that the two are
					// equivalent, and then returns the 2nd matrix.
					const createNewClientFromSummary = async function summarize<T>(
						summarizer: SharedMatrix<T>,
					): Promise<void> {
						// Create a summary
						const objectStorage = MockStorage.createFromSummary(
							summarizer.getAttachSummary(true).summary,
						);

						// Create a local DataStoreRuntime since we only want to load the summary for a local client.
						const dataStoreRuntime = new MockFluidDataStoreRuntime();
						const containerRuntimeN = containerRuntimeFactory.createContainerRuntime(
							dataStoreRuntime,
							{ minimumSequenceNumber: containerRuntimeFactory.sequenceNumber },
						);
						const servicesN: IChannelServices = {
							deltaConnection: dataStoreRuntime.createDeltaConnection(),
							objectStorage,
						};

						const matrixN = await matrixFactory.load(
							dataStoreRuntime,
							`matrix-${matrices.length}`,
							servicesN,
							matrixFactory.attributes,
						);
						if (undoRedoStacks) {
							const undoRedo = new UndoRedoStackManager();
							matrixN.openUndo(undoRedo);
							undoRedoStacks.push(undoRedo);
						}
						matrices.push(matrixN);
						runtimes.push(containerRuntimeN);

						// Vet that the 2nd matrix is equivalent to the original.
						expectSize(matrixN, summarizer.rowCount, summarizer.colCount);
						assert.deepEqual(
							extract(summarizer),
							extract(matrixN),
							"Matrix must round-trip through summarize/load.",
						);
					};

					// Create matrices for this stress run. Create extra summarizer. We will use last client as
					// summarizer.
					for (let i = 0; i <= numClients; i++) {
						const dataStoreRuntimeN = new MockFluidDataStoreRuntime();
						const containerRuntimeN =
							containerRuntimeFactory.createContainerRuntime(dataStoreRuntimeN);
						const servicesN: IChannelServices = {
							deltaConnection: dataStoreRuntimeN.createDeltaConnection(),
							objectStorage: new MockStorage(),
						};

						const matrixN = matrixFactory.create(
							dataStoreRuntimeN,
							i === numClients ? "summarizer" : `matrix-${i}`,
						);
						if (isSetCellPolicyFWW === 1) {
							matrixN.switchSetCellPolicy();
						}

						matrixN.connect(servicesN);
						if (i < numClients) {
							if (undoRedoStacks) {
								const undoRedo = new UndoRedoStackManager();
								matrixN.openUndo(undoRedo);
								undoRedoStacks.push(undoRedo);
							}
							matrices.push(matrixN);
						} else {
							summarizer = matrixN;
						}
						runtimes.push(containerRuntimeN);
					}

					const matrix0 = matrices[0];

					// Initialize PRNG with given seed.
					const float64 = new Random(seed).float64;

					// Returns a pseudorandom 32b integer in the range [0 .. max).
					const int32 = (max = 0x7fffffff): number => Math.trunc(float64() * max);

					// Returns an array with 'n' random values, each in the range [0 .. 100).
					const values = (n: number): number[] =>
						Array.from({ length: n })
							.fill(0)
							.map(() => int32(100));

					// Invokes 'setCells()' on the matrix w/the given index and logs the command to the trace.
					const setCells = (
						matrixIndex: number,
						row: number,
						col: number,
						colCount: number,
						values: MatrixItem<unknown>[],
					): void => {
						const matrix = matrices[matrixIndex];
						trace?.push(
							`matrix${
								matrixIndex + 1
							}.setCells(/* row: */ ${row}, /* col: */ ${col}, /* colCount: */ ${colCount}, ${JSON.stringify(
								values,
							)});    // rowCount: ${matrix.rowCount} colCount: ${matrix.colCount} stride: ${
								matrix.colCount
							} length: ${values.length}`,
						);
						matrix.setCells(row, col, colCount, values);
					};

					// Initialize with [0..5] row and [0..5] cols, filling the cells.
					{
						const rowCount = int32(5);
						if (rowCount > 0) {
							trace?.push(
								`matrix1.insertRows(/* rowStart: */ 0, /* rowCount: */ ${rowCount});    // rowCount: ${matrix0.rowCount}, colCount: ${matrix0.colCount}`,
							);
							matrix0.insertRows(0, rowCount);
						}

						const colCount = int32(5);
						if (colCount > 0) {
							trace?.push(
								`matrix1.insertCols(/* colStart: */ 0, /* colCount: */ ${colCount});    // rowCount: ${matrix0.rowCount}, colCount: ${matrix0.colCount}`,
							);
							matrix0.insertCols(0, colCount);
						}

						if (colCount > 0 && rowCount > 0) {
							setCells(
								/* matrixIndex: */ 0,
								/* row: */ 0,
								/* col: */ 0,
								colCount,
								Array.from({ length: colCount * rowCount })
									.fill(0)
									.map((_, index) => index),
							);
						}
					}

					assert(summarizer !== undefined);
					for (const m of matrices) {
						logMatrix(m);
					}
					logMatrix(summarizer);

					// Loop for the prescribed number of iterations, randomly mutating one of matrices with one
					// of the following operations:
					//
					//    * insert or remove rows
					//    * insert or remove cols
					//    * set a range of cells
					//
					// Following each operation, there is a `syncProbability` chance that clients will exchange
					// ops and vet convergence.
					for (let i = 0; i < numOps; i++) {
						// Choose a client to perform the operation.
						const matrixIndex = int32(matrices.length);
						const matrix = matrices[matrixIndex];

						const { rowCount, colCount } = matrix;
						const row = int32(rowCount);
						const col = int32(colCount);
						let type = int32(7);
						if (
							(type === 2 && maxRows !== undefined && rowCount >= maxRows) ||
							(type === 3 && maxCols !== undefined && colCount >= maxCols)
						) {
							type = 4; // Make it to set some cells instead of inserting any row/col
						}
						switch (type) {
							case 0: {
								// remove 1 or more rows (if any exist)
								if (rowCount > 0) {
									// 10% probability of removing multiple rows.
									const numRemoved = float64() < 0.1 ? int32(rowCount - row - 1) + 1 : 1;

									trace?.push(
										`matrix${
											matrixIndex + 1
										}.removeRows(/* rowStart: */ ${row}, /* rowCount: */ ${numRemoved});    // rowCount: ${
											// rowCount and colCount are destructured above and used to keep track of the initial
											// row and column counts in the matrix.
											rowCount - numRemoved
										}, colCount: ${colCount}`,
									);
									matrix.removeRows(row, numRemoved);
								}
								break;
							}

							case 1: {
								// remove 1 or more cols (if any exist)
								if (colCount > 0) {
									// 10% probability of removing multiple cols.
									const numRemoved = float64() < 0.1 ? int32(colCount - col - 1) + 1 : 1;

									trace?.push(
										`matrix${
											matrixIndex + 1
										}.removeCols(/* colStart: */ ${col}, /* colCount: */ ${numRemoved});    // rowCount: ${rowCount}, colCount: ${
											colCount - numRemoved
										}`,
									);
									matrix.removeCols(col, numRemoved);
								}
								break;
							}

							case 2: {
								// insert 1 or more rows (20% probability of inserting 2-4 rows).
								const numInserted = float64() < 0.2 ? int32(3) + 1 : 1;

								trace?.push(
									`matrix${
										matrixIndex + 1
									}.insertRows(/* rowStart: */ ${row}, /* rowCount: */ ${numInserted});    // rowCount: ${
										rowCount + numInserted
									}, colCount: ${colCount}`,
								);
								matrix.insertRows(row, numInserted);

								// 90% probability of filling the newly inserted row with values.
								if (float64() < 0.9 && colCount > 0) {
									setCells(
										matrixIndex,
										row,
										/* col: */ 0,
										colCount,
										values(colCount * numInserted),
									);
								}
								break;
							}

							case 3: {
								// insert 1 or more cols (20% probability of inserting 2-4 cols).
								const numInserted = float64() < 0.2 ? int32(3) + 1 : 1;

								trace?.push(
									`matrix${
										matrixIndex + 1
									}.insertCols(/* colStart: */ ${col}, /* colCount: */ ${numInserted});    // rowCount: ${rowCount}, colCount: ${
										colCount + numInserted
									}`,
								);
								matrix.insertCols(col, numInserted);

								// 90% probability of filling the newly inserted col with values.
								if (float64() < 0.9 && rowCount > 0) {
									setCells(
										matrixIndex,
										/* row: */ 0,
										col,
										numInserted,
										values(rowCount * numInserted),
									);
								}
								break;
							}

							default: {
								// set a range of cells (if matrix is non-empty)
								if (rowCount > 0 && colCount > 0) {
									const stride = int32(colCount - col - 1) + 1;
									const length = (int32(rowCount - row - 1) + 1) * stride;
									setCells(matrixIndex, row, col, stride, values(length));
								}
								undoRedoStacks?.[matrixIndex]?.closeCurrentOperation();
								break;
							}
						}

						if (float64() < undoProbability) {
							undoRedoStacks?.[matrixIndex]?.undoOperation();
						}

						if (float64() < disconnectProbability) {
							// If the client is already disconnected, first reconnect it to cover the case where
							// multiple reconnections are required.
							if (!runtimes[matrixIndex].connected) {
								trace?.push(`containerRuntime${matrixIndex + 1}.connected = true;`);
								runtimes[matrixIndex].connected = true;
							}

							trace?.push(`containerRuntime${matrixIndex + 1}.connected = false;`);

							runtimes[matrixIndex].connected = false;
						}

						if (
							i > 0 &&
							i % 10 === 0 &&
							isSetCellPolicyFWW === 2 &&
							float64() < switchProbability &&
							matrix.isSetCellConflictResolutionPolicyFWW() !== true
						) {
							trace?.push(`switched policy on matrix${matrixIndex + 1}`);
							matrix.switchSetCellPolicy();
						}

						if (
							float64() < newClientJoinProbability &&
							(maxClients === undefined || matrices.length < maxClients)
						) {
							await createNewClientFromSummary(summarizer);
							trace?.push(`New client joined!!`);
						}

						// Clients periodically exchanging ops, at which point we verify they have converged
						// on the same state.
						if (float64() < syncProbability) {
							await expect();
							matrixTrace = [];
							for (const m of matrices) {
								logMatrix(m);
							}
							logMatrix(summarizer);
						}
					}

					// Test is finished.  Drain pending ops and vet that clients converged.
					await expect();
				} catch (error) {
					// If an error occurs, dump the repro instructions.
					for (const s of trace) {
						console.log(s);
					}

					// Dump the last sync state.
					for (const s of matrixTrace) {
						console.log(s);
					}

					for (const m of matrices) {
						assert(m instanceof SharedMatrixClass);
						console.log(
							`Matrix id=${
								m.id
							} SetCell Resolution Policy is FFW = ${m.isSetCellConflictResolutionPolicyFWW()}`,
						);
					}

					// Also dump the current state of the matrices.
					for (const m of matrices) {
						// eslint-disable-next-line @typescript-eslint/no-base-to-string
						console.log(m.toString());
					}

					// Finally, rethrow the original error.
					throw error;
				}
			}

			for (const {
				numClients,
				numOps,
				syncProbability,
				disconnectProbability,
				undoRedoProbability,
				switchProbability,
				newClientJoinProbability,
				seed,
			} of [
				{
					numClients: 2,
					numOps: 150,
					syncProbability: 0.3,
					disconnectProbability: 0,
					undoRedoProbability: 0,
					switchProbability: 0.1,
					newClientJoinProbability: 0,
					seed: 0x84d43a0a,
				},
				{
					numClients: 3,
					numOps: 120,
					syncProbability: 0.07,
					disconnectProbability: 0,
					undoRedoProbability: 0,
					switchProbability: 0.2,
					newClientJoinProbability: 0,
					seed: 0x655c763b,
				},
				{
					numClients: 5,
					numOps: 200,
					syncProbability: 0,
					disconnectProbability: 0,
					undoRedoProbability: 0,
					switchProbability: 0.25,
					newClientJoinProbability: 0.1,
					seed: 0x2f98736d,
				},
				{
					numClients: 2,
					numOps: 150,
					syncProbability: 0.15,
					disconnectProbability: 0.4,
					undoRedoProbability: 0,
					switchProbability: 0.3,
					newClientJoinProbability: 0.02,
					seed: 0x84d43a0a,
				},
				{
					numClients: 3,
					numOps: 100,
					syncProbability: 0.2,
					disconnectProbability: 0,
					undoRedoProbability: 0.2,
					switchProbability: 0.15,
					newClientJoinProbability: 0.05,
					seed: 0x84f43a0a,
				},
				{
					numClients: 2,
					numOps: 100,
					syncProbability: 0.2,
					disconnectProbability: 0,
					undoRedoProbability: 0.2,
					switchProbability: 0.1,
					newClientJoinProbability: 0.1,
					seed: 0x73493cb5,
				},
				{
					numClients: 2,
					numOps: 100,
					syncProbability: 0.03,
					disconnectProbability: 0.2,
					undoRedoProbability: 0.1,
					switchProbability: 0.15,
					newClientJoinProbability: 0.03,
					seed: 0x84b98618,
				},
				{
					numClients: 3,
					numOps: 500,
					syncProbability: 0,
					disconnectProbability: 0,
					undoRedoProbability: 0.2,
					switchProbability: 0.1,
					newClientJoinProbability: 0.1,
					seed: 0xf0cc140e,
				},
				{
					numClients: 3,
					numOps: 100,
					syncProbability: 0.1,
					disconnectProbability: 0,
					undoRedoProbability: 0,
					switchProbability: 0.02,
					newClientJoinProbability: 0.09,
					seed: 0xbb56bb9e,
				},
			]) {
				it(`Stress (numClients=${numClients} numOps=${numOps} syncProbability=${syncProbability} disconnectProbability=${disconnectProbability} undoRedoProbability=${undoRedoProbability} switchProbability=${switchProbability} newClientJoinProbability=${newClientJoinProbability} seed=0x${seed
					.toString(16)
					.padStart(8, "0")})`, async function () {
					// Note: Must use 'function' rather than arrow '() => { .. }' in order to set 'this.timeout(..)'
					this.timeout(30000);

					await stress(
						numClients,
						numOps,
						syncProbability,
						disconnectProbability,
						undoRedoProbability,
						switchProbability,
						newClientJoinProbability,
						seed,
					);
				});
			}

			if (isSetCellPolicyFWW === 2) {
				for (let i = 0; i < 10; i++) {
					// Cannot read properties of undefined (reading 'start') in PermutationVector.handleToPosition while undoing.
					// So skip this test for now. It happens for LWW also.
					if (i === 4) {
						continue;
					}
					it(`Stress Test With Small Matrix and Policy switch from LWW -> FWW: Seed ${i}`, async function () {
						// Note: Must use 'function' rather than arrow '() => { .. }' in order to set 'this.timeout(..)'
						this.timeout(30000);

						const numClients = 2;
						const numOps = 120;
						const syncProbability = 0.1;
						const disconnectProbability = 0.1;
						const undoRedoProbability = 0.07;
						const switchProbability = 0.1;
						const newClientJoinProbability = 0.02;
						await stress(
							numClients,
							numOps,
							syncProbability,
							disconnectProbability,
							undoRedoProbability,
							switchProbability,
							newClientJoinProbability,
							i,
							2, // maxRows
							2, // maxCols
							3, // maxClients
						);
					});
				}

				it(`Stress Test With Small Matrix and lots of clients addition`, async function () {
					// Note: Must use 'function' rather than arrow '() => { .. }' in order to set 'this.timeout(..)'
					this.timeout(35000);

					const numClients = 2;
					const numOps = 120;
					const syncProbability = 0.06;
					const disconnectProbability = 0.1;
					const undoRedoProbability = 0;
					const switchProbability = 0.04;
					const newClientJoinProbability = 0.3;
					await stress(
						numClients,
						numOps,
						syncProbability,
						disconnectProbability,
						undoRedoProbability,
						switchProbability,
						newClientJoinProbability,
						1000,
						2, // maxRows
						2, // maxCols
						10, // maxClients
					);
				});
			}

			it.skip("stress-loop", async function () {
				// Note: Must use 'function' rather than arrow '() => { .. }' in order to set 'this.timeout(..)'
				this.timeout(0); // Disable timeouts for stress loop

				let iterations = 0;
				const start = Date.now();

				// eslint-disable-next-line no-constant-condition
				while (true) {
					await stress(
						/* numClients: */ 3,
						/* numOps: */ 10000,
						/* syncProbability: */ 0.1,
						/* disconnectProbability: */ 0.01,
						/* undoRedoProbability */ 0,
						/* switchProbability */ 0,
						/* newClientJoinProbability */ 0,
						// eslint-disable-next-line no-bitwise
						/* seed: */ (Math.random() * 0x100000000) >>> 0,
					);

					// Note: Mocha reporter intercepts 'console.log()' so use 'process.stdout.write' instead.
					// eslint-disable-next-line @typescript-eslint/no-base-to-string
					process.stdout.write(matrices[0].toString());

					process.stdout.write(
						`Stress loop: ${++iterations} iterations completed - Total Elapsed: ${(
							(Date.now() - start) / 1000
						).toFixed(2)}s\n`,
					);
				}
			});
		});
	});
}
