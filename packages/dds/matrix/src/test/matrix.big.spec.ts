/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AttachState } from "@fluidframework/container-definitions";
import { IChannelServices } from "@fluidframework/datastore-definitions/internal";
import {
	MockContainerRuntimeFactory,
	MockEmptyDeltaConnection,
	MockFluidDataStoreRuntime,
	MockStorage,
} from "@fluidframework/test-runtime-utils/internal";

import { SharedMatrix } from "../index.js";

import { checkCorners, expectSize, setCorners, matrixFactory } from "./utils.js";

const enum Const {
	// https://support.office.com/en-us/article/excel-specifications-and-limits-1672b34d-7043-467e-8e27-269d656771c3
	excelMaxRows = 1048576,
	excelMaxCols = 16384,
}

// Summarizes the given `SharedMatrix`, loads the summary into a 2nd SharedMatrix, vets that the two are
// equivalent, and then returns the 2nd matrix.
async function summarize<T>(matrix: SharedMatrix<T>): Promise<SharedMatrix<T>> {
	// Create a summary
	const objectStorage = MockStorage.createFromSummary(matrix.getAttachSummary().summary);

	// Create a local DataStoreRuntime since we only want to load the summary for a local client.
	const dataStoreRuntime = new MockFluidDataStoreRuntime({
		attachState: AttachState.Detached,
	});

	const matrix2 = await matrixFactory.load(
		dataStoreRuntime,
		`load(${matrix.id})`,
		{
			deltaConnection: new MockEmptyDeltaConnection(),
			objectStorage,
		},
		matrixFactory.attributes,
	);

	// Vet that the 2nd matrix is equivalent to the original.
	expectSize(matrix2, matrix.rowCount, matrix.colCount);

	return matrix2;
}

for (const isSetCellPolicyFWW of [false, true]) {
	describe(`Big Matrix isSetCellPolicyFWW=${isSetCellPolicyFWW}`, function () {
		this.timeout(10000);

		describe(`Excel-size matrix (${Const.excelMaxRows}x${Const.excelMaxCols})`, () => {
			let matrix1: SharedMatrix;
			let matrix2: SharedMatrix;
			let dataStoreRuntime1: MockFluidDataStoreRuntime;
			let containerRuntimeFactory: MockContainerRuntimeFactory;

			beforeEach("createMatrices", async () => {
				containerRuntimeFactory = new MockContainerRuntimeFactory();

				// Create and connect the first SharedMatrix.
				dataStoreRuntime1 = new MockFluidDataStoreRuntime();
				const containerRuntime1 =
					containerRuntimeFactory.createContainerRuntime(dataStoreRuntime1);
				const services1: IChannelServices = {
					deltaConnection: dataStoreRuntime1.createDeltaConnection(),
					objectStorage: new MockStorage(),
				};

				matrix1 = matrixFactory.create(dataStoreRuntime1, "matrix1");
				if (isSetCellPolicyFWW) {
					matrix1.switchSetCellPolicy();
				}
				matrix1.connect(services1);

				// Create and connect the second SharedMatrix.
				const dataStoreRuntime2 = new MockFluidDataStoreRuntime();
				const containerRuntime2 =
					containerRuntimeFactory.createContainerRuntime(dataStoreRuntime2);
				const services2: IChannelServices = {
					deltaConnection: dataStoreRuntime2.createDeltaConnection(),
					objectStorage: new MockStorage(),
				};
				matrix2 = matrixFactory.create(dataStoreRuntime2, "matrix2");
				if (isSetCellPolicyFWW) {
					matrix2.switchSetCellPolicy();
				}
				matrix2.connect(services2);
			});

			it("create", async () => {
				matrix1.insertRows(0, Const.excelMaxRows);
				matrix1.insertCols(0, Const.excelMaxCols);

				containerRuntimeFactory.processAllMessages();

				expectSize(matrix2, Const.excelMaxRows, Const.excelMaxCols);
			});

			it("write corners", async () => {
				matrix1.insertRows(0, Const.excelMaxRows);
				matrix1.insertCols(0, Const.excelMaxCols);

				setCorners(matrix1);
				checkCorners(matrix1);

				containerRuntimeFactory.processAllMessages();

				checkCorners(matrix2);
			});

			it("remove corners (empty)", async () => {
				matrix1.insertRows(0, Const.excelMaxRows);
				matrix1.insertCols(0, Const.excelMaxCols);

				expectSize(matrix1, Const.excelMaxRows, Const.excelMaxCols);

				containerRuntimeFactory.processAllMessages();

				expectSize(matrix2, Const.excelMaxRows, Const.excelMaxCols);

				matrix1.removeRows(/* rowStart: */ matrix1.rowCount - 1, /* rowCount: */ 1);
				matrix1.removeRows(/* rowStart: */ 0, /* rowCount: */ 1);
				matrix1.removeCols(/* rowStart: */ matrix1.colCount - 1, /* colCount: */ 1);
				matrix1.removeCols(/* rowStart: */ 0, /* colCount: */ 1);

				expectSize(matrix1, Const.excelMaxRows - 2, Const.excelMaxCols - 2);

				containerRuntimeFactory.processAllMessages();

				expectSize(matrix2, Const.excelMaxRows - 2, Const.excelMaxCols - 2);
			});

			it("remove all (empty)", async () => {
				matrix1.insertRows(0, Const.excelMaxRows);
				matrix1.insertCols(0, Const.excelMaxCols);
				expectSize(matrix1, Const.excelMaxRows, Const.excelMaxCols);

				containerRuntimeFactory.processAllMessages();

				expectSize(matrix2, Const.excelMaxRows, Const.excelMaxCols);

				matrix1.removeRows(/* rowStart: */ 0, /* rowCount: */ matrix1.rowCount);
				matrix1.removeCols(/* rowStart: */ 0, /* colCount: */ matrix1.colCount);

				expectSize(matrix1, 0, 0);

				containerRuntimeFactory.processAllMessages();

				expectSize(matrix2, 0, 0);
			});

			it("remove corners (populated)", async () => {
				matrix1.insertRows(0, Const.excelMaxRows);
				matrix1.insertCols(0, Const.excelMaxCols);

				setCorners(matrix1);
				checkCorners(matrix1);

				containerRuntimeFactory.processAllMessages();

				checkCorners(matrix2);

				matrix1.removeRows(/* rowStart: */ matrix1.rowCount - 1, /* rowCount: */ 1);
				matrix1.removeRows(/* rowStart: */ 0, /* rowCount: */ 1);
				matrix1.removeCols(/* rowStart: */ matrix1.colCount - 1, /* colCount: */ 1);
				matrix1.removeCols(/* rowStart: */ 0, /* colCount: */ 1);

				expectSize(matrix1, Const.excelMaxRows - 2, Const.excelMaxCols - 2);

				containerRuntimeFactory.processAllMessages();

				expectSize(matrix2, Const.excelMaxRows - 2, Const.excelMaxCols - 2);
			});

			it("remove all (corners populated)", async () => {
				matrix1.insertRows(0, Const.excelMaxRows);
				matrix1.insertCols(0, Const.excelMaxCols);

				setCorners(matrix1);
				checkCorners(matrix1);

				containerRuntimeFactory.processAllMessages();

				checkCorners(matrix2);

				matrix1.removeRows(/* rowStart: */ 0, /* rowCount: */ matrix1.rowCount);
				matrix1.removeCols(/* rowStart: */ 0, /* colCount: */ matrix1.colCount);

				expectSize(matrix1, 0, 0);

				containerRuntimeFactory.processAllMessages();

				expectSize(matrix2, 0, 0);
			});
		});

		describe("local client summarize", () => {
			// MergeTree client expects a either no delta manager or a real delta manager with minimumSequenceNumber and
			// lastSequenceNumber to be updated.
			// So, we test summarize with local client because MockFluidDataStoreRuntime has no delta manager and is
			// assigned one once it is connected.

			let matrix: SharedMatrix;

			beforeEach("createMatrix", async () => {
				// Create a SharedMatrix in local state.
				const dataStoreRuntime = new MockFluidDataStoreRuntime({
					attachState: AttachState.Detached,
				});
				matrix = matrixFactory.create(dataStoreRuntime, "matrix1");
				if (isSetCellPolicyFWW) {
					matrix.switchSetCellPolicy();
				}
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
}
