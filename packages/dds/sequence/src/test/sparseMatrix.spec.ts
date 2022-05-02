/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IChannelServices } from "@fluidframework/datastore-definitions";
import {
    MockFluidDataStoreRuntime,
    MockContainerRuntimeFactory,
    MockContainerRuntimeFactoryForReconnection,
    MockContainerRuntimeForReconnection,
    MockStorage,
} from "@fluidframework/test-runtime-utils";
import { SparseMatrix, SparseMatrixFactory, SparseMatrixItem } from "../sparsematrix";

describe("SparseMatrix", () => {
    const extract = (matrix: SparseMatrix, numCols: number) => {
        const rows: SparseMatrixItem[][] = [];
        for (let r = 0; r < matrix.numRows; r++) {
            const cols: SparseMatrixItem[] = [];
            for (let c = 0; c < numCols; c++) {
                cols.push(matrix.getItem(r, c));
            }
            rows.push(cols);
        }
        return rows;
    };

    describe("local state", () => {
        let dataStoreRuntime: MockFluidDataStoreRuntime;
        let matrix: SparseMatrix;

        before(async () => {
            dataStoreRuntime = new MockFluidDataStoreRuntime();
            matrix = new SparseMatrix(dataStoreRuntime, "matrix", SparseMatrixFactory.Attributes);
        });

        const expect = async (expected: readonly (readonly any[])[]) => {
            const expectedCols = expected.length > 0
                ? expected[0].length
                : 0;

            assert.strictEqual(matrix.numRows, expected.length);
            assert.deepStrictEqual(extract(matrix, expectedCols), expected);

            assert.strictEqual(matrix.numRows, expected.length);
            assert.deepStrictEqual(extract(matrix, expectedCols), expected);
        };

        it("initially empty", async () => {
            await expect([]);
        });

        it("append row", async () => {
            matrix.insertRows(0, 1);
            await expect([
                [undefined],
            ]);
        });

        it("set(0,0)", async () => {
            matrix.setItems(0, 0, ["BL"]);
            await expect([
                ["BL", undefined],
            ]);
        });

        it("insert 1 row", async () => {
            matrix.insertRows(0, 1);
            await expect([
                [undefined, undefined],
                ["BL", undefined],
            ]);
        });

        it("set(0,0..1),set(1,1)", async () => {
            matrix.setItems(0, 0, ["TL", "TR"]);
            matrix.setItems(1, 1, ["BR"]);
            await expect([
                ["TL", "TR", undefined],
                ["BL", "BR", undefined],
            ]);
        });

        it("insert 1 col", async () => {
            matrix.insertCols(1, 1);
            await expect([
                ["TL", undefined, "TR", undefined],
                ["BL", undefined, "BR", undefined],
            ]);
        });

        it("remove 1 col", async () => {
            matrix.removeCols(1, 1);
            await expect([
                ["TL", "TR", undefined],
                ["BL", "BR", undefined],
            ]);
        });

        it("remove 1 row", async () => {
            matrix.removeRows(0, 1);
            await expect([
                ["BL", "BR"],
            ]);
        });
    });

    describe("connected state", () => {
        let matrix1: SparseMatrix;
        let matrix2: SparseMatrix;
        let containerRuntimeFactory: MockContainerRuntimeFactory;

        const print = (matrix: SparseMatrix) => {
            for (const row of extract(matrix, 10)) {
                console.log(`[${row.join(",")}]`);
            }
        };

        const assertMatrices = async (expected: readonly (readonly any[])[]) => {
            containerRuntimeFactory.processAllMessages();

            print(matrix1);
            assert.deepStrictEqual(extract(matrix1, 10), extract(matrix2, 10));

            const expectedCols = expected.length > 0
                ? expected[0].length
                : 0;

            assert.strictEqual(matrix1.numRows, expected.length);
            assert.deepStrictEqual(extract(matrix1, expectedCols), expected);
        };

        describe("two clients", () => {
            beforeEach(async () => {
                containerRuntimeFactory = new MockContainerRuntimeFactory();

                // Create and connect the first SparseMatrix.
                const dataStoreRuntime1 = new MockFluidDataStoreRuntime();
                const containerRuntime1 = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime1);
                const services1: IChannelServices = {
                    deltaConnection: containerRuntime1.createDeltaConnection(),
                    objectStorage: new MockStorage(),
                };
                matrix1 = new SparseMatrix(dataStoreRuntime1, "matrix1", SparseMatrixFactory.Attributes);
                matrix1.initializeLocal();
                matrix1.connect(services1);

                // Create and connect the second SparseMatrix.
                const dataStoreRuntime2 = new MockFluidDataStoreRuntime();
                const containerRuntime2 = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime2);
                const services2: IChannelServices = {
                    deltaConnection: containerRuntime2.createDeltaConnection(),
                    objectStorage: new MockStorage(),
                };
                matrix2 = new SparseMatrix(dataStoreRuntime2, "matrix2", SparseMatrixFactory.Attributes);
                matrix2.initializeLocal();
                matrix2.connect(services2);
            });

            it("row insertion conflict", async () => {
                matrix1.insertRows(0, 1);
                matrix1.setItems(0, 1, [1, 2]);

                matrix2.insertRows(0, 1);
                matrix2.setItems(0, 1, ["A", "B"]);

                await assertMatrices([
                    [undefined, "A", "B", undefined],
                    [undefined, 1, 2, undefined],
                ]);
            });

            it("col insertion conflict", async () => {
                matrix1.insertRows(0, 1);
                matrix1.setItems(0, 0, [">", "<"]);
                await assertMatrices([
                    [">", "<", undefined],
                ]);

                matrix1.insertCols(1, 1);
                matrix1.setItems(0, 1, [1]);

                matrix2.insertCols(1, 1);
                matrix2.setItems(0, 1, [2]);
                await assertMatrices([
                    [">", 2, 1, "<", undefined],
                ]);
            });

            it("row/col insertion conflict", async () => {
                matrix1.insertRows(0, 1);
                matrix1.setItems(0, 0, [">", "<"]);
                await assertMatrices([
                    [">", "<", undefined],
                ]);

                matrix1.insertCols(1, 1);
                matrix1.setItems(0, 1, [1]);

                matrix2.insertRows(0, 1);
                matrix2.setItems(0, 1, [2]);
                await assertMatrices([
                    [undefined, 2, undefined, undefined],
                    [">", 1, "<", undefined],
                ]);
            });

            it("marshalls JSON", async () => {
                // The nesting is mostly a test of the recursive Json<T> type declaration.
                const json = {
                    z: null,
                    b: true,
                    n: 0,
                    s: "s0",
                    a: [null, false, 1, "s1", {
                        b: true,
                        n: 1,
                        s: "s2",
                        a: [{
                            b: false,
                            n: 2,
                            s: "s2",
                            a: [],
                            o: {},
                        }], o: {},
                    }],
                    o: {
                        b: false,
                        n: 3,
                        s: "s3", a: [null, false, 1, "s1", {
                            b: false,
                            n: -1,
                            s: "s2",
                            a: [{
                                b: false,
                                n: -1,
                                s: "s2",
                                a: [],
                                o: {},
                            }], o: {},
                        }],
                        o: {},
                    },
                };

                const items = [null, true, -1, "s", [null, true, -1, "s"], json];

                matrix1.insertRows(0, 1);
                matrix1.insertCols(0, items.length);
                matrix1.setItems(0, 0, items);

                await assertMatrices([items]);
            });
        });

        describe("reconnection with two clients", () => {
            let containerRuntime1: MockContainerRuntimeForReconnection;
            let containerRuntime2: MockContainerRuntimeForReconnection;

            beforeEach(async () => {
                containerRuntimeFactory = new MockContainerRuntimeFactoryForReconnection();

                // Create and connect the first SharedMatrix.
                const dataStoreRuntime1 = new MockFluidDataStoreRuntime();
                containerRuntime1 = (containerRuntimeFactory as MockContainerRuntimeFactoryForReconnection)
                    .createContainerRuntime(dataStoreRuntime1);
                const services1: IChannelServices = {
                    deltaConnection: containerRuntime1.createDeltaConnection(),
                    objectStorage: new MockStorage(),
                };
                matrix1 = new SparseMatrix(dataStoreRuntime1, "matrix", SparseMatrixFactory.Attributes);
                matrix1.initializeLocal();
                matrix1.connect(services1);

                // Create and connect the second SharedMatrix.
                const dataStoreRuntime2 = new MockFluidDataStoreRuntime();
                containerRuntime2 = (containerRuntimeFactory as MockContainerRuntimeFactoryForReconnection)
                    .createContainerRuntime(dataStoreRuntime2);
                const services2: IChannelServices = {
                    deltaConnection: containerRuntime2.createDeltaConnection(),
                    objectStorage: new MockStorage(),
                };
                matrix2 = new SparseMatrix(dataStoreRuntime2, "matrix2", SparseMatrixFactory.Attributes);
                matrix2.initializeLocal();
                matrix2.connect(services2);
            });

            it("can resend unacked ops on reconnection", async () => {
                // Insert a row and set items in the first sparse matrix.
                matrix1.insertRows(0, 1);
                matrix1.setItems(0, 0, [">", "<"]);

                // Disconnect and reconnect the first client.
                containerRuntime1.connected = false;
                containerRuntime1.connected = true;

                // Verify that both the matrices have expected content.
                await assertMatrices([
                    [">", "<", undefined],
                ]);

                // Perform a few operations on the second sparse matrix.
                matrix2.insertCols(1, 1);
                matrix2.setItems(0, 1, [1]);

                matrix2.insertRows(0, 1);
                matrix2.setItems(0, 1, [2]);

                // Disconnect and reconnect the second client.
                containerRuntime2.connected = false;
                containerRuntime2.connected = true;

                // Verify that both the matrices have expected content.
                await assertMatrices([
                    [undefined, 2, undefined, undefined],
                    [">", 1, "<", undefined],
                ]);
            });

            it("can store ops in disconnected state and resend them on reconnection", async () => {
                // Disconnect the first client.
                containerRuntime1.connected = false;

                // Insert a row and set items in the first sparse matrix.
                matrix1.insertRows(0, 1);
                matrix1.setItems(0, 0, [">", "<"]);

                // Reconnect the first client.
                containerRuntime1.connected = true;

                // Verify that both the matrices have expected content.
                await assertMatrices([
                    [">", "<", undefined],
                ]);

                // Disconnect the second client.
                containerRuntime2.connected = false;

                // Perform a few operations on the second sparse matrix.
                matrix2.insertCols(1, 1);
                matrix2.setItems(0, 1, [1]);

                matrix2.insertRows(0, 1);
                matrix2.setItems(0, 1, [2]);

                // Reconnect the second client.
                containerRuntime2.connected = true;

                // Verify that both the matrices have expected content.
                await assertMatrices([
                    [undefined, 2, undefined, undefined],
                    [">", 1, "<", undefined],
                ]);
            });
        });
    });
});
