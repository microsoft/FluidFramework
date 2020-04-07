/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import "mocha";

import { strict as assert } from "assert";
import { Random } from "best-random";
import { TestHost } from "@microsoft/fluid-local-test-utils";
import { SharedMatrix, SharedMatrixFactory } from "../src";
import { extract, expectSize } from "./utils";

describe("Matrix", () => {
    describe("stress", () => {
        let matrices: SharedMatrix[];       // Array of matrices under test
        let hosts: TestHost[];              // Test clients for each matrix
        let trace: string[];                // Repro steps to be printed if a failure is encountered.

        /**
         * Drains the queue of pending ops for each client and vets that all matrices converged on the same state.
         */
        const expect = async () => {
            try {
                await TestHost.sync(...hosts);

                const matrix0 = matrices[0];
                const actual0 = extract(matrix0);

                for (let i = 1; i < matrices.length; i++) {
                    const matrixN = matrices[i];
                    const actualN = extract(matrixN);
                    assert.deepEqual(actual0, actualN);

                    // Vet that empty matrices have identical dimensions (see notes on `expectSize`).
                    expectSize(matrixN, matrix0.numRows, matrix0.numCols);
                }
            } catch (error) {
                for (const s of trace) {
                    console.log(s);
                }

                for (const m of matrices) {
                    console.log(m.toString());
                }

                throw error;
            }
        };

        /**
         * Performs a stress run using the given parameters.  'syncProbability' is the probability
         * that the clients will drain their queue of incoming messages and check for convergence.
         *
         * 'seed' is the 32-bit integer used to seed the PRNG.
         */
        async function stress(numClients: number, numIterations: number, syncProbability: number, seed: number) {
            try {
                trace = [];

                // Create TestHosts and matrices for this stress run.
                const host0 = new TestHost([], [SharedMatrix.getFactory()]);
                const matrix0 = await host0.createType<SharedMatrix>("matrix", SharedMatrixFactory.Type);

                hosts = [host0];
                matrices = [matrix0];

                for (let i = 1; i < numClients; i++) {
                    const hostN = host0.clone();
                    hosts.push(hostN);

                    const matrixN = await hostN.getType<SharedMatrix>(matrix0.id);
                    matrices.push(matrixN);
                }

                // Initialize PRNG with given seed.
                const float64 = new Random(seed).float64;

                // Returns a pseudorandom 32b integer in the range [0 .. max).
                const int32 = (max = 0x7FFFFFFF) => (float64() * max) | 0;

                // Returns an array with 'n' random values, each in the range [0 .. 100).
                const values = (n: number) => new Array(n)
                    .fill(0)
                    .map(() => int32(100));

                // Initialize with [0..5] row and [0..5] cols, filling the cells.
                {
                    const numRows = int32(5);
                    if (numRows > 0) {
                        matrix0.insertRows(0, numRows);
                        trace?.push(`matrix1.insertRows(0,${numRows});    // numRows: ${matrix0.numRows}, numCols: ${matrix0.numCols}`);
                    }

                    const numCols = int32(5);
                    if (numCols > 0) {
                        matrix0.insertCols(0, numCols);
                        trace?.push(`matrix1.insertCols(0,${numCols});    // numRows: ${matrix0.numRows}, numCols: ${matrix0.numCols}`);
                    }

                    if (numCols > 0 && numRows > 0) {
                        const v = new Array(numCols * numRows).fill(0).map((_, index) => index);
                        matrix0.setCells(0, 0, numCols, v);
                        trace?.push(`matrix1.setCells(0, 0, ${numCols}, ${JSON.stringify(v)});`);
                    }
                }

                // Loop for the prescribed number of iterations, randomly mutating one of matrices with one
                // of the following operations:
                //
                //    * insert or remove rows
                //    * insert or remove cols
                //    * set a range of cells
                //
                // Following each operation, there is a `syncProbability` chance that clients will exchange
                // ops and vet convergence.
                for (let i = 0; i < numIterations; i++) {
                    // Choose a client to perform the operation.
                    const matrixIndex = int32(matrices.length);
                    const matrix = matrices[matrixIndex];

                    const { numRows, numCols } = matrix;
                    const row = int32(numRows);
                    const col = int32(numCols);

                    switch(int32(7)) {
                        case 0: {
                            // remove 1 or more rows (if any exist)
                            if (numRows > 0) {
                                // 10% probability of removing multiple rows.
                                const numRemoved = float64() < 0.1
                                    ? int32(numRows - row - 1) + 1
                                    : 1;

                                matrix.removeRows(row, numRemoved);
                                trace?.push(`matrix${matrixIndex + 1}.removeRows(${row},${numRemoved});    // numRows: ${matrix.numRows}, numCols: ${matrix.numCols}`);
                            }
                            break;
                        }

                        case 1: {
                            // remove 1 or more cols (if any exist)
                            if (numCols > 0) {
                                // 10% probability of removing multiple cols.
                                const numRemoved = float64() < 0.1
                                    ? int32(numCols - col - 1) + 1
                                    : 1;

                                matrix.removeCols(col, numRemoved);
                                trace?.push(`matrix${matrixIndex + 1}.removeCols(${col},${numRemoved});    // numRows: ${matrix.numRows}, numCols: ${matrix.numCols}`);
                            }
                            break;
                        }

                        case 2: {
                            // insert 1 or more rows (20% probability of inserting 2-4 rows).
                            const numInserted = float64() < 0.2
                                ? int32(3) + 1
                                : 1;

                            matrix.insertRows(row, numInserted);
                            trace?.push(`matrix${matrixIndex + 1}.insertRows(${row},${numInserted});    // numRows: ${matrix.numRows}, numCols: ${matrix.numCols}`);

                            // 90% probability of filling the newly inserted row with values.
                            if (float64() < 0.9) {
                                if (numCols > 0) {
                                    const v = values(matrix.numCols * numInserted);
                                    matrix.setCells(row, 0, matrix.numCols, v);
                                    trace?.push(`matrix${matrixIndex + 1}.setCells(/* row: */ ${row}, /* col: */ 0, /* numCols: */ ${matrix.numCols}, ${JSON.stringify(v)});`);
                                }
                            }
                            break;
                        }

                        case 3: {
                            // insert 1 or more cols (20% probability of inserting 2-4 cols).
                            const numInserted = float64() < 0.2
                                ? int32(3) + 1
                                : 1;

                            matrix.insertCols(col, numInserted);
                            trace?.push(`matrix${matrixIndex + 1}.insertCols(${col},${numInserted});    // numRows: ${matrix.numRows}, numCols: ${matrix.numCols}`);

                            // 90% probability of filling the newly inserted col with values.
                            if (float64() < 0.9) {
                                if (numRows > 0) {
                                    const v = values(matrix.numRows * numInserted);
                                    matrix.setCells(0, col, numInserted, v);
                                    trace?.push(`matrix${matrixIndex + 1}.setCells(/* row: */ 0, /* col: */ ${col}, /* numCols: */ 1, ${JSON.stringify(v)});`);
                                }
                            }
                            break;
                        }

                        default: {
                            // set a range of cells (if matrix is non-empty)
                            if (numRows > 0 && numCols > 0) {
                                const stride = int32(numCols - col - 1) + 1;
                                const length = (int32(numRows - row - 1) + 1) * stride;
                                const v = values(length);
                                matrix.setCells(row, col, stride, v);
                                trace?.push(`matrix${matrixIndex + 1}.setCells(/* row: */ ${row}, /* col: */ ${col}, /* numCols: */ ${stride}, ${JSON.stringify(v)});`);
                            }
                            break;
                        }
                    }

                    // Clients periodically exchanging ops, at which point we verify they have converged
                    // on the same state.
                    if (float64() < syncProbability) {
                        await expect();
                        trace?.push("await expect()");
                    }
                }

                // Test is finished.  Drain pending ops and vet that clients converged.
                await expect();
            } finally {
                for (const host of hosts) {
                    await host.close();
                }
            }
        }

        function test(numClients: number, numIterations: number, syncProbability: number, seed: number = (Math.random() * 0x100000000) >>> 0) {
            it(`Stress (numClients=${numClients} numIterations=${numIterations} syncProbability=${syncProbability} seed=0x${seed.toString(16).padStart(8, "0")})`, async () => {
                await stress(numClients, numIterations, syncProbability, seed);
            });
        }

        test(/* numClients: */ 3, /* numIterations: */ 500, /* syncProbability: */ 0.1, 0xa42c4fe5);

        it.skip("stress-loop", async function() {
            this.timeout(0);    // Disable timeouts for stress loop

            const start = Date.now();
            while (true) {
                await stress(/* numClients: */ 5, /* numIterations: */ 2000, /* syncProbability: */ 0.05, (Math.random() * 0x100000000) >>> 0);
                console.log(matrices[0].toString());
                console.log(`Elapsed: ${((Date.now() - start) / 1000).toFixed(2)}s\n`)
            }
        });
    });
});
