/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import "mocha";

import { v4 as uuid } from "uuid";
import { TestHost } from "@fluidframework/local-test-utils";
import { Serializable } from "@fluidframework/component-runtime-definitions";
import { MockEmptyDeltaConnection, MockRuntime, MockStorage } from "@fluidframework/test-runtime-utils";
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

    // Load the snapshot into a newly created 2nd SharedMatrix.
    const runtime = new MockRuntime();
    const matrix2 = new SharedMatrix<T>(runtime, `load(${matrix.id})`, SharedMatrixFactory.Attributes);
    await matrix2.load(/*branchId: */ null as any, {
        deltaConnection: new MockEmptyDeltaConnection(),
        objectStorage
    });

    // Vet that the 2nd matrix is equivalent to the original.
    expectSize(matrix2, matrix.numRows, matrix.numCols);

    return matrix2;
}

describe("Big Matrix", function () {
    this.timeout(10000);

    let host1: TestHost;    // Note: Single client tests also require two clients to externally observe
    let host2: TestHost;    //       when all ops have processed with `TestHost.sync()`.

    async function sync() {
        await TestHost.sync(host1, host2);
    }

    before(async () => {
        host1 = new TestHost([], [SharedMatrix.getFactory()]);
        host2 = host1.clone();
    });

    after(async () => {
        await Promise.all([host1.close(), host2.close()]);
    });

    let matrix1: SharedMatrix;
    let matrix2: SharedMatrix;

    beforeEach(async () => {
        matrix1 = await host1.createType(uuid(), SharedMatrixFactory.Type);
        matrix2 = await host2.getType(matrix1.id);
    });

    describe(`Excel-size matrix (${Const.excelMaxRows}x${Const.excelMaxCols})`, () => {
        it("create", async () => {
            matrix1.insertRows(0, Const.excelMaxRows);
            matrix1.insertCols(0, Const.excelMaxCols);

            await sync();

            expectSize(matrix2, Const.excelMaxRows, Const.excelMaxCols);
        });

        it("write corners", async () => {
            matrix1.insertRows(0, Const.excelMaxRows);
            matrix1.insertCols(0, Const.excelMaxCols);

            setCorners(matrix1);
            checkCorners(matrix1);

            await sync();
            checkCorners(matrix2);

            const fromSnapshot = await snapshot(matrix1);
            checkCorners(fromSnapshot);
        });

        it("remove populated", async () => {
            matrix1.insertRows(0, Const.excelMaxRows);
            matrix1.insertCols(0, Const.excelMaxCols);

            setCorners(matrix1);
            checkCorners(matrix1);

            await sync();
            checkCorners(matrix2);

            matrix1.removeRows(0, matrix1.numRows);
            matrix1.removeCols(0, matrix1.numCols);
            expectSize(matrix1, 0, 0);

            await sync();
            expectSize(matrix2, 0, 0);
        });
    });
});
