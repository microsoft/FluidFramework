/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { reconnectAndSquash } from "@fluid-private/test-dds-utils";
import {
	MockContainerRuntimeFactoryForReconnection,
	MockFluidDataStoreRuntime,
	MockStorage,
} from "@fluidframework/test-runtime-utils/internal";

import { extract, matrixFactory } from "./utils.js";

describe("SharedMatrix squash on resubmit", () => {
	it("drops intermediate setCell when a later setCell supersedes it on the same cell", () => {
		const containerRuntimeFactory = new MockContainerRuntimeFactoryForReconnection();
		const dataRuntime1 = new MockFluidDataStoreRuntime();
		const containerRuntime1 = containerRuntimeFactory.createContainerRuntime(dataRuntime1);
		const dataRuntime2 = new MockFluidDataStoreRuntime();
		containerRuntimeFactory.createContainerRuntime(dataRuntime2);

		const matrix1 = matrixFactory.create(dataRuntime1, "A");
		matrix1.connect({
			deltaConnection: dataRuntime1.createDeltaConnection(),
			objectStorage: new MockStorage(),
		});
		const matrix2 = matrixFactory.create(dataRuntime2, "B");
		matrix2.connect({
			deltaConnection: dataRuntime2.createDeltaConnection(),
			objectStorage: new MockStorage(),
		});

		matrix1.insertRows(0, 1);
		matrix1.insertCols(0, 1);
		containerRuntimeFactory.processAllMessages();

		const peerCellValues: unknown[] = [];
		matrix2.openMatrix({
			rowsChanged: () => {},
			colsChanged: () => {},
			cellsChanged: (rowStart, colStart, rowCount, colCount) => {
				for (let r = rowStart; r < rowStart + rowCount; r++) {
					for (let c = colStart; c < colStart + colCount; c++) {
						peerCellValues.push(matrix2.getCell(r, c));
					}
				}
			},
		});

		containerRuntime1.connected = false;
		matrix1.setCell(0, 0, "secret");
		matrix1.setCell(0, 0, "final");
		reconnectAndSquash(containerRuntime1, dataRuntime1);
		containerRuntimeFactory.processAllMessages();

		assert.deepEqual(extract(matrix1), [["final"]]);
		assert.deepEqual(extract(matrix2), [["final"]]);
		for (const value of peerCellValues) {
			assert.notEqual(value, "secret", "intermediate cell value must not leak through squash");
		}
	});

	it("squashes setCell chains to a single final value per cell", () => {
		const containerRuntimeFactory = new MockContainerRuntimeFactoryForReconnection();
		const dataRuntime1 = new MockFluidDataStoreRuntime();
		const containerRuntime1 = containerRuntimeFactory.createContainerRuntime(dataRuntime1);
		const dataRuntime2 = new MockFluidDataStoreRuntime();
		containerRuntimeFactory.createContainerRuntime(dataRuntime2);

		const matrix1 = matrixFactory.create(dataRuntime1, "A");
		matrix1.connect({
			deltaConnection: dataRuntime1.createDeltaConnection(),
			objectStorage: new MockStorage(),
		});
		const matrix2 = matrixFactory.create(dataRuntime2, "B");
		matrix2.connect({
			deltaConnection: dataRuntime2.createDeltaConnection(),
			objectStorage: new MockStorage(),
		});

		matrix1.insertRows(0, 1);
		matrix1.insertCols(0, 2);
		containerRuntimeFactory.processAllMessages();

		const peerObservedValues: unknown[] = [];
		matrix2.openMatrix({
			rowsChanged: () => {},
			colsChanged: () => {},
			cellsChanged: (rowStart, colStart, rowCount, colCount) => {
				for (let r = rowStart; r < rowStart + rowCount; r++) {
					for (let c = colStart; c < colStart + colCount; c++) {
						peerObservedValues.push({ r, c, v: matrix2.getCell(r, c) });
					}
				}
			},
		});

		containerRuntime1.connected = false;
		matrix1.setCell(0, 0, "a0");
		matrix1.setCell(0, 1, "b0");
		matrix1.setCell(0, 0, "a1");
		matrix1.setCell(0, 0, "a2");
		matrix1.setCell(0, 1, "b1");
		reconnectAndSquash(containerRuntime1, dataRuntime1);
		containerRuntimeFactory.processAllMessages();

		assert.deepEqual(extract(matrix2), [["a2", "b1"]]);
		for (const obs of peerObservedValues) {
			assert.notEqual(obs, undefined);
			assert.notEqual((obs as { v: unknown }).v, "a0");
			assert.notEqual((obs as { v: unknown }).v, "a1");
			assert.notEqual((obs as { v: unknown }).v, "b0");
		}
	});

	it("passes through a single pending setCell unchanged", () => {
		const containerRuntimeFactory = new MockContainerRuntimeFactoryForReconnection();
		const dataRuntime1 = new MockFluidDataStoreRuntime();
		const containerRuntime1 = containerRuntimeFactory.createContainerRuntime(dataRuntime1);
		const dataRuntime2 = new MockFluidDataStoreRuntime();
		containerRuntimeFactory.createContainerRuntime(dataRuntime2);

		const matrix1 = matrixFactory.create(dataRuntime1, "A");
		matrix1.connect({
			deltaConnection: dataRuntime1.createDeltaConnection(),
			objectStorage: new MockStorage(),
		});
		const matrix2 = matrixFactory.create(dataRuntime2, "B");
		matrix2.connect({
			deltaConnection: dataRuntime2.createDeltaConnection(),
			objectStorage: new MockStorage(),
		});

		matrix1.insertRows(0, 1);
		matrix1.insertCols(0, 1);
		containerRuntimeFactory.processAllMessages();

		containerRuntime1.connected = false;
		matrix1.setCell(0, 0, "only");
		reconnectAndSquash(containerRuntime1, dataRuntime1);
		containerRuntimeFactory.processAllMessages();

		assert.deepEqual(extract(matrix2), [["only"]]);
	});
});
