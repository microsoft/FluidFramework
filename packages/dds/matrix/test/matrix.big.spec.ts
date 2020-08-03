/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import "mocha";

import { IChannelServices, Serializable } from "@fluidframework/datastore-runtime-definitions";
import {
    MockFluidDataStoreRuntime,
    MockContainerRuntimeFactory,
    MockEmptyDeltaConnection,
    MockStorage,
} from "@fluidframework/test-runtime-utils";
import { SharedMatrix, SharedMatrixFactory } from "../src";
import { expectSize, setCorners, checkCorners } from "./utils";

const enum Const {
    // https://support.office.com/en-us/article/excel-specifications-and-limits-1672b34d-7043-467e-8e27-269d656771c3
    excelMaxRows = 1048576,
    excelMaxCols = 16384,
}

// Snapshots the given `SharedMatrix`, loads the snapshot into a 2nd SharedMatrix, vets that the two are
// equivalent, and then returns the 2nd matrix.
async function snapshot<T extends Serializable>(matrix: SharedMatrix<T>) {
    // Create a snapshot
    const objectStorage = new MockStorage(matrix.snapshot());

    // Create a local ComponentRuntime since we only want to load the snapshot for a local client.
    const componentRuntime = new MockFluidDataStoreRuntime();
    componentRuntime.local = true;

    // Load the snapshot into a newly created 2nd SharedMatrix.
    const matrix2 = new SharedMatrix<T>(componentRuntime, `load(${matrix.id})`, SharedMatrixFactory.Attributes);
    await matrix2.load(/*branchId: */ null as any, {
        deltaConnection: new MockEmptyDeltaConnection(),
        objectStorage
    });

    // Vet that the 2nd matrix is equivalent to the original.
    expectSize(matrix2, matrix.rowCount, matrix.colCount);

    return matrix2;
}

describe("Big Matrix", function () {
    this.timeout(10000);

    describe(`Excel-size matrix (${Const.excelMaxRows}x${Const.excelMaxCols})`, () => {
        let matrix1: SharedMatrix;
        let matrix2: SharedMatrix;
        let componentRuntime1: MockFluidDataStoreRuntime;
        let containterRuntimeFactory: MockContainerRuntimeFactory;

        beforeEach(async () => {
            containterRuntimeFactory = new MockContainerRuntimeFactory();

            // Create and connect the first SharedMatrix.
            componentRuntime1 = new MockFluidDataStoreRuntime();
            const containerRuntime1 = containterRuntimeFactory.createContainerRuntime(componentRuntime1);
            const services1: IChannelServices = {
                deltaConnection: containerRuntime1.createDeltaConnection(),
                objectStorage: new MockStorage(),
            };
            matrix1 = new SharedMatrix(componentRuntime1, "matrix1", SharedMatrixFactory.Attributes);
            matrix1.connect(services1);

            // Create and connect the second SharedMatrix.
            const componentRuntime2 = new MockFluidDataStoreRuntime();
            const containerRuntime2 = containterRuntimeFactory.createContainerRuntime(componentRuntime2);
            const services2: IChannelServices = {
                deltaConnection: containerRuntime2.createDeltaConnection(),
                objectStorage: new MockStorage(),
            };
            matrix2 = new SharedMatrix(componentRuntime2, "matrix2", SharedMatrixFactory.Attributes);
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

        it("remove populated", async () => {
            matrix1.insertRows(0, Const.excelMaxRows);
            matrix1.insertCols(0, Const.excelMaxCols);

            setCorners(matrix1);
            checkCorners(matrix1);

            containterRuntimeFactory.processAllMessages();

            checkCorners(matrix2);

            matrix1.removeRows(0, matrix1.rowCount);
            matrix1.removeCols(0, matrix1.colCount);
            expectSize(matrix1, 0, 0);

            containterRuntimeFactory.processAllMessages();

            expectSize(matrix2, 0, 0);
        });
    });

    describe("local client snapshot", () => {
        // MergeTree client expects a either no delta manager or a real delta manager with minimumSequenceNumber and
        // lastSequenceNumber to be updated.
        // Sp, we test snapshots with local client because MockFluidDataStoreRuntime has no delta manager and is assigned
        // one once it is connected.

        let matrix: SharedMatrix;

        beforeEach(async () => {
            // Create a SharedMatrix in local state.
            const componentRuntime = new MockFluidDataStoreRuntime();
            componentRuntime.local = true;
            matrix = new SharedMatrix(componentRuntime, "matrix1", SharedMatrixFactory.Attributes);
        });

        it("snapshot", async () => {
            matrix.insertRows(0, Const.excelMaxRows);
            matrix.insertCols(0, Const.excelMaxCols);

            setCorners(matrix);
            checkCorners(matrix);

            const fromSnapshot = await snapshot(matrix);
            checkCorners(fromSnapshot);
        });
    });
});
