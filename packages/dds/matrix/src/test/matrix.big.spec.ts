/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IChannelServices } from "@fluidframework/datastore-definitions";
import {
    MockFluidDataStoreRuntime,
    MockContainerRuntimeFactory,
    MockEmptyDeltaConnection,
    MockStorage,
} from "@fluidframework/test-runtime-utils";
import { SharedMatrix, SharedMatrixFactory } from "..";
import { expectSize, setCorners, checkCorners } from "./utils";

const enum Const {
    // https://support.office.com/en-us/article/excel-specifications-and-limits-1672b34d-7043-467e-8e27-269d656771c3
    excelMaxRows = 1048576,
    excelMaxCols = 16384,
}

// Summarizes the given `SharedMatrix`, loads the summary into a 2nd SharedMatrix, vets that the two are
// equivalent, and then returns the 2nd matrix.
async function summarize<T>(matrix: SharedMatrix<T>) {
    // Create a summary
    const objectStorage = MockStorage.createFromSummary(matrix.summarize().summary);

    // Create a local DataStoreRuntime since we only want to load the summary for a local client.
    const dataStoreRuntime = new MockFluidDataStoreRuntime();
    dataStoreRuntime.local = true;

    // Load the summary into a newly created 2nd SharedMatrix.
    const matrix2 = new SharedMatrix<T>(dataStoreRuntime, `load(${matrix.id})`, SharedMatrixFactory.Attributes);
    await matrix2.load({
        deltaConnection: new MockEmptyDeltaConnection(),
        objectStorage,
    });

    // Vet that the 2nd matrix is equivalent to the original.
    expectSize(matrix2, matrix.rowCount, matrix.colCount);

    return matrix2;
}

describe("Big Matrix", function() {
    this.timeout(10000);

    describe(`Excel-size matrix (${Const.excelMaxRows}x${Const.excelMaxCols})`, () => {
        let matrix1: SharedMatrix;
        let matrix2: SharedMatrix;
        let dataStoreRuntime1: MockFluidDataStoreRuntime;
        let containterRuntimeFactory: MockContainerRuntimeFactory;

        beforeEach(async () => {
            containterRuntimeFactory = new MockContainerRuntimeFactory();

            // Create and connect the first SharedMatrix.
            dataStoreRuntime1 = new MockFluidDataStoreRuntime();
            const containerRuntime1 = containterRuntimeFactory.createContainerRuntime(dataStoreRuntime1);
            const services1: IChannelServices = {
                deltaConnection: containerRuntime1.createDeltaConnection(),
                objectStorage: new MockStorage(),
            };
            matrix1 = new SharedMatrix(dataStoreRuntime1, "matrix1", SharedMatrixFactory.Attributes);
            matrix1.connect(services1);

            // Create and connect the second SharedMatrix.
            const dataStoreRuntime2 = new MockFluidDataStoreRuntime();
            const containerRuntime2 = containterRuntimeFactory.createContainerRuntime(dataStoreRuntime2);
            const services2: IChannelServices = {
                deltaConnection: containerRuntime2.createDeltaConnection(),
                objectStorage: new MockStorage(),
            };
            matrix2 = new SharedMatrix(dataStoreRuntime2, "matrix2", SharedMatrixFactory.Attributes);
            matrix2.connect(services2);
        });

        it("create", async () => {
            matrix1.insertRows(0, Const.excelMaxRows);
            matrix1.insertCols(0, Const.excelMaxCols);

            containterRuntimeFactory.processAllMessages();

            expectSize(matrix2, Const.excelMaxRows, Const.excelMaxCols);
        });

        it("write corners", async () => {
            matrix1.insertRows(0, Const.excelMaxRows);
            matrix1.insertCols(0, Const.excelMaxCols);

            setCorners(matrix1);
            checkCorners(matrix1);

            containterRuntimeFactory.processAllMessages();

            checkCorners(matrix2);
        });

        it("remove corners (empty)", async () => {
            matrix1.insertRows(0, Const.excelMaxRows);
            matrix1.insertCols(0, Const.excelMaxCols);

            expectSize(matrix1, Const.excelMaxRows, Const.excelMaxCols);

            containterRuntimeFactory.processAllMessages();

            expectSize(matrix2, Const.excelMaxRows, Const.excelMaxCols);

            matrix1.removeRows(/* rowStart: */ matrix1.rowCount - 1, /* rowCount: */ 1);
            matrix1.removeRows(/* rowStart: */ 0, /* rowCount: */ 1);
            matrix1.removeCols(/* rowStart: */ matrix1.colCount - 1, /* colCount: */ 1);
            matrix1.removeCols(/* rowStart: */ 0, /* colCount: */ 1);

            expectSize(matrix1, Const.excelMaxRows - 2, Const.excelMaxCols - 2);

            containterRuntimeFactory.processAllMessages();

            expectSize(matrix2, Const.excelMaxRows - 2, Const.excelMaxCols - 2);
        });

        it("remove all (empty)", async () => {
            matrix1.insertRows(0, Const.excelMaxRows);
            matrix1.insertCols(0, Const.excelMaxCols);
            expectSize(matrix1, Const.excelMaxRows, Const.excelMaxCols);

            containterRuntimeFactory.processAllMessages();

            expectSize(matrix2, Const.excelMaxRows, Const.excelMaxCols);

            matrix1.removeRows(/* rowStart: */ 0, /* rowCount: */ matrix1.rowCount);
            matrix1.removeCols(/* rowStart: */ 0, /* colCount: */ matrix1.colCount);

            expectSize(matrix1, 0, 0);

            containterRuntimeFactory.processAllMessages();

            expectSize(matrix2, 0, 0);
        });

        it("remove corners (populated)", async () => {
            matrix1.insertRows(0, Const.excelMaxRows);
            matrix1.insertCols(0, Const.excelMaxCols);

            setCorners(matrix1);
            checkCorners(matrix1);

            containterRuntimeFactory.processAllMessages();

            checkCorners(matrix2);

            matrix1.removeRows(/* rowStart: */ matrix1.rowCount - 1, /* rowCount: */ 1);
            matrix1.removeRows(/* rowStart: */ 0, /* rowCount: */ 1);
            matrix1.removeCols(/* rowStart: */ matrix1.colCount - 1, /* colCount: */ 1);
            matrix1.removeCols(/* rowStart: */ 0, /* colCount: */ 1);

            expectSize(matrix1, Const.excelMaxRows - 2, Const.excelMaxCols - 2);

            containterRuntimeFactory.processAllMessages();

            expectSize(matrix2, Const.excelMaxRows - 2, Const.excelMaxCols - 2);
        });

        it("remove all (corners populated)", async () => {
            matrix1.insertRows(0, Const.excelMaxRows);
            matrix1.insertCols(0, Const.excelMaxCols);

            setCorners(matrix1);
            checkCorners(matrix1);

            containterRuntimeFactory.processAllMessages();

            checkCorners(matrix2);

            matrix1.removeRows(/* rowStart: */ 0, /* rowCount: */ matrix1.rowCount);
            matrix1.removeCols(/* rowStart: */ 0, /* colCount: */ matrix1.colCount);

            expectSize(matrix1, 0, 0);

            containterRuntimeFactory.processAllMessages();

            expectSize(matrix2, 0, 0);
        });
    });

    describe("local client summarize", () => {
        // MergeTree client expects a either no delta manager or a real delta manager with minimumSequenceNumber and
        // lastSequenceNumber to be updated.
        // So, we test summarize with local client because MockFluidDataStoreRuntime has no delta manager and is
        // assigned one once it is connected.

        let matrix: SharedMatrix;

        beforeEach(async () => {
            // Create a SharedMatrix in local state.
            const dataStoreRuntime = new MockFluidDataStoreRuntime();
            dataStoreRuntime.local = true;
            matrix = new SharedMatrix(dataStoreRuntime, "matrix1", SharedMatrixFactory.Attributes);
        });

        it("summarize", async () => {
            matrix.insertRows(0, Const.excelMaxRows);
            matrix.insertCols(0, Const.excelMaxCols);

            setCorners(matrix);
            checkCorners(matrix);

            const fromSummary = await summarize(matrix);
            checkCorners(fromSummary);
        });
    });
});
