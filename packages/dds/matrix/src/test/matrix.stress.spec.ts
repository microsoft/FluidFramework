/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { Random } from "best-random";
import { IChannelServices } from "@fluidframework/datastore-definitions";
import {
    MockFluidDataStoreRuntime,
    MockStorage,
    MockContainerRuntimeFactoryForReconnection,
    MockContainerRuntimeForReconnection,
} from "@fluidframework/test-runtime-utils";
import { SharedMatrix, SharedMatrixFactory } from "..";
import { extract, expectSize } from "./utils";

describe("Matrix", () => {
    describe("stress", () => {
        let containerRuntimeFactory: MockContainerRuntimeFactoryForReconnection;
        let matrices: SharedMatrix[];       // Array of matrices under test
        let runtimes: MockContainerRuntimeForReconnection[] = [];
        let trace: string[];                // Repro steps to be printed if a failure is encountered.

        /**
         * Drains the queue of pending ops for each client and vets that all matrices converged on the same state.
         */
        const expect = async () => {
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
        async function stress(numClients: number,
            numOps: number, syncProbability: number, disconnectProbability: number, seed: number) {
            try {
                matrices = [];
                runtimes = [];
                trace = [];

                containerRuntimeFactory = new MockContainerRuntimeFactoryForReconnection();

                // Create matrices for this stress run.
                for (let i = 0; i < numClients; i++) {
                    const dataStoreRuntimeN = new MockFluidDataStoreRuntime();
                    const containerRuntimeN = containerRuntimeFactory.createContainerRuntime(dataStoreRuntimeN);
                    const servicesN: IChannelServices = {
                        deltaConnection: containerRuntimeN.createDeltaConnection(),
                        objectStorage: new MockStorage(),
                    };

                    const matrixN = new SharedMatrix(dataStoreRuntimeN, `matrix-${i}`, SharedMatrixFactory.Attributes);
                    matrixN.connect(servicesN);

                    matrices.push(matrixN);
                    runtimes.push(containerRuntimeN);
                }

                const matrix0 = matrices[0];

                // Initialize PRNG with given seed.
                // eslint-disable-next-line @typescript-eslint/unbound-method
                const float64 = new Random(seed).float64;

                // Returns a pseudorandom 32b integer in the range [0 .. max).
                // eslint-disable-next-line no-bitwise
                const int32 = (max = 0x7FFFFFFF) => (float64() * max) | 0;

                // Returns an array with 'n' random values, each in the range [0 .. 100).
                const values = (n: number) => new Array(n)
                    .fill(0)
                    .map(() => int32(100));

                // Invokes 'setCells()' on the matrix w/the given index and logs the command to the trace.
                const setCells = (matrixIndex: number, row: number, col: number, colCount: number, values: any[]) => {
                    const matrix = matrices[matrixIndex];
                    // eslint-disable-next-line max-len
                    trace?.push(`matrix${matrixIndex + 1}.setCells(/* row: */ ${row}, /* col: */ ${col}, /* colCount: */ ${colCount}, ${JSON.stringify(values)});    // rowCount: ${matrix.rowCount} colCount: ${matrix.colCount} stride: ${matrix.colCount} length: ${values.length}`);
                    matrix.setCells(row, col, colCount, values);
                };

                // Initialize with [0..5] row and [0..5] cols, filling the cells.
                {
                    const rowCount = int32(5);
                    if (rowCount > 0) {
                        // eslint-disable-next-line max-len
                        trace?.push(`matrix1.insertRows(/* rowStart: */ 0, /* rowCount: */ ${rowCount});    // rowCount: ${matrix0.rowCount}, colCount: ${matrix0.colCount}`);
                        matrix0.insertRows(0, rowCount);
                    }

                    const colCount = int32(5);
                    if (colCount > 0) {
                        // eslint-disable-next-line max-len
                        trace?.push(`matrix1.insertCols(/* colStart: */ 0, /* colCount: */ ${colCount});    // rowCount: ${matrix0.rowCount}, colCount: ${matrix0.colCount}`);
                        matrix0.insertCols(0, colCount);
                    }

                    if (colCount > 0 && rowCount > 0) {
                        setCells(/* matrixIndex: */ 0, /* row: */ 0, /* col: */ 0, colCount,
                            new Array(colCount * rowCount).fill(0).map((_, index) => index));
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
                for (let i = 0; i < numOps; i++) {
                    // Choose a client to perform the operation.
                    const matrixIndex = int32(matrices.length);
                    const matrix = matrices[matrixIndex];

                    const { rowCount, colCount } = matrix;
                    const row = int32(rowCount);
                    const col = int32(colCount);

                    switch (int32(7)) {
                        case 0: {
                            // remove 1 or more rows (if any exist)
                            if (rowCount > 0) {
                                // 10% probability of removing multiple rows.
                                const numRemoved = float64() < 0.1
                                    ? int32(rowCount - row - 1) + 1
                                    : 1;

                                // eslint-disable-next-line max-len
                                trace?.push(`matrix${matrixIndex + 1}.removeRows(/* rowStart: */ ${row}, /* rowCount: */ ${numRemoved});    // rowCount: ${matrix.rowCount - numRemoved}, colCount: ${matrix.colCount}`);
                                matrix.removeRows(row, numRemoved);
                            }
                            break;
                        }

                        case 1: {
                            // remove 1 or more cols (if any exist)
                            if (colCount > 0) {
                                // 10% probability of removing multiple cols.
                                const numRemoved = float64() < 0.1
                                    ? int32(colCount - col - 1) + 1
                                    : 1;

                                // eslint-disable-next-line max-len
                                trace?.push(`matrix${matrixIndex + 1}.removeCols(/* colStart: */ ${col}, /* colCount: */ ${numRemoved});    // rowCount: ${matrix.rowCount}, colCount: ${matrix.colCount - numRemoved}`);
                                matrix.removeCols(col, numRemoved);
                            }
                            break;
                        }

                        case 2: {
                            // insert 1 or more rows (20% probability of inserting 2-4 rows).
                            const numInserted = float64() < 0.2
                                ? int32(3) + 1
                                : 1;

                            // eslint-disable-next-line max-len
                            trace?.push(`matrix${matrixIndex + 1}.insertRows(/* rowStart: */ ${row}, /* rowCount: */ ${numInserted});    // rowCount: ${matrix.rowCount + numInserted}, colCount: ${matrix.colCount}`);
                            matrix.insertRows(row, numInserted);

                            // 90% probability of filling the newly inserted row with values.
                            if (float64() < 0.9) {
                                if (colCount > 0) {
                                    setCells(matrixIndex, row, /* col: */ 0, matrix.colCount,
                                        values(matrix.colCount * numInserted));
                                }
                            }
                            break;
                        }

                        case 3: {
                            // insert 1 or more cols (20% probability of inserting 2-4 cols).
                            const numInserted = float64() < 0.2
                                ? int32(3) + 1
                                : 1;

                            // eslint-disable-next-line max-len
                            trace?.push(`matrix${matrixIndex + 1}.insertCols(/* colStart: */ ${col}, /* colCount: */ ${numInserted});    // rowCount: ${matrix.rowCount}, colCount: ${matrix.colCount + numInserted}`);
                            matrix.insertCols(col, numInserted);

                            // 90% probability of filling the newly inserted col with values.
                            if (float64() < 0.9) {
                                if (rowCount > 0) {
                                    setCells(matrixIndex, /* row: */ 0, col, numInserted,
                                        values(matrix.rowCount * numInserted));
                                }
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
                            break;
                        }
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

                    // Clients periodically exchanging ops, at which point we verify they have converged
                    // on the same state.
                    if (float64() < syncProbability) {
                        await expect();
                    }
                }

                // Test is finished.  Drain pending ops and vet that clients converged.
                await expect();
            } catch (error) {
                // If an error occurs, dump the repro instructions.
                for (const s of trace) {
                    console.log(s);
                }

                // Also dump the current state of the matrices.
                for (const m of matrices) {
                    console.log(m.toString());
                }

                // Finally, rethrow the original error.
                throw error;
            }
        }

        for (const { numClients, numOps, syncProbability, disconnectProbability, seed } of [
            { numClients: 2, numOps: 200, syncProbability: 0.3, disconnectProbability: 0, seed: 0x84d43a0a },
            { numClients: 3, numOps: 200, syncProbability: 0.1, disconnectProbability: 0, seed: 0x655c763b },
            { numClients: 5, numOps: 200, syncProbability: 0.0, disconnectProbability: 0, seed: 0x2f98736d },
            { numClients: 2, numOps: 200, syncProbability: 0.2, disconnectProbability: 0.4, seed: 0x84d43a0a },
        ]) {
            // eslint-disable-next-line max-len
            it(`Stress (numClients=${numClients} numOps=${numOps} syncProbability=${syncProbability} disconnectProbability=${disconnectProbability} seed=0x${seed.toString(16).padStart(8, "0")})`,
                // Note: Must use 'function' rather than arrow '() => { .. }' in order to set 'this.timeout(..)'
                async function() {
                    this.timeout(20000);

                    await stress(numClients, numOps, syncProbability, disconnectProbability, seed);
                },
            );
        }

        it("stress-loop",
            // Note: Must use 'function' rather than arrow '() => { .. }' in order to set 'this.timeout(..)'
            async function() {
                this.timeout(0);    // Disable timeouts for stress loop

                let iterations = 0;
                const start = Date.now();

                // eslint-disable-next-line no-constant-condition
                while (true) {
                    await stress(
                        /* numClients: */ 3,
                        /* numOps: */ 10000,
                        /* syncProbability: */ 0.1,
                        /* disconnectProbability: */ 0.01,
                        // eslint-disable-next-line no-bitwise
                        /* seed: */ (Math.random() * 0x100000000) >>> 0,
                    );

                    // Note: Mocha reporter intercepts 'console.log()' so use 'process.stdout.write' instead.
                    process.stdout.write(matrices[0].toString());

                    process.stdout.write(
                        `Stress loop: ${++iterations} iterations completed - Total Elapsed: ${
                            ((Date.now() - start) / 1000).toFixed(2)
                        }s\n`);
                }
            },
        );
    });
});
