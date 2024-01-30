/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	MockContainerRuntimeFactoryForReconnection,
	MockFluidDataStoreRuntime,
	MockStorage,
} from "@fluidframework/test-runtime-utils";
import { SharedMatrix } from "../matrix";
import { extract } from "./utils";

describe("SharedMatrix reconnect", () => {
	// This test demonstrates the need to use the `currentSeq` on the collab window at resubmission time
	// rather than the refSeq of the original op. Since that information is only used in local op metadata
	// and only used for resubmitting ops, disconnecting twice is necessary to reproduce the issue.
	it("resolves insert+set against concurrent insert after disconnecting twice", () => {
		const factory = SharedMatrix.getFactory();
		const containerRuntimeFactory = new MockContainerRuntimeFactoryForReconnection();
		const dataRuntime1 = new MockFluidDataStoreRuntime();
		const containerRuntime1 = containerRuntimeFactory.createContainerRuntime(dataRuntime1);
		const dataRuntime2 = new MockFluidDataStoreRuntime();
		const containerRuntime2 = containerRuntimeFactory.createContainerRuntime(dataRuntime2);
		const matrix1 = factory.create(dataRuntime1, "A") as SharedMatrix<number>;
		matrix1.connect({
			deltaConnection: dataRuntime1.createDeltaConnection(),
			objectStorage: new MockStorage(),
		});
		const matrix2 = factory.create(dataRuntime2, "B") as SharedMatrix<number>;
		matrix2.connect({
			deltaConnection: dataRuntime2.createDeltaConnection(),
			objectStorage: new MockStorage(),
		});

		matrix1.insertCols(0, 1);
		containerRuntimeFactory.processAllMessages();

		containerRuntime1.connected = false;
		matrix1.insertRows(0, 1);
		matrix2.insertRows(0, 1);

		containerRuntimeFactory.processAllMessages();
		containerRuntime1.connected = true;
		containerRuntime2.connected = false;

		// Matrix2 hasn't yet seen the row inserted by matrix1, so this set should refer to the row that matrix2 inserted.
		matrix2.setCell(0, 0, 42);
		containerRuntimeFactory.processAllMessages();
		containerRuntime2.connected = true;
		containerRuntime2.connected = false;
		containerRuntime2.connected = true;
		containerRuntimeFactory.processAllMessages();

		const expected = [[undefined], [42]];
		assert.deepEqual(extract(matrix1), expected);
		assert.deepEqual(extract(matrix2), expected);
	});

	// This is a fuzz test minimization of a scenario where resubmit requires information outside of the collab
	// window dictated by incoming messages. It motivates the need for Client's minSeq updating logic to take into
	// account in-flight ops.
	// See "client.applyMsg updates minSeq" in merge-tree's test suite for a lower-level unit test of some relevant behavior.
	it("avoids zamboni of information required to resubmit", async () => {
		const factory = SharedMatrix.getFactory();
		const containerRuntimeFactory = new MockContainerRuntimeFactoryForReconnection();
		const dataRuntime1 = new MockFluidDataStoreRuntime();
		const containerRuntime1 = containerRuntimeFactory.createContainerRuntime(dataRuntime1);
		const dataRuntime2 = new MockFluidDataStoreRuntime();
		const containerRuntime2 = containerRuntimeFactory.createContainerRuntime(dataRuntime2);
		const dataRuntime3 = new MockFluidDataStoreRuntime();
		const containerRuntime3 = containerRuntimeFactory.createContainerRuntime(dataRuntime3);
		const matrix1 = factory.create(dataRuntime1, "A") as SharedMatrix<number>;

		matrix1.insertCols(0, 2);
		const { summary } = matrix1.getAttachSummary();
		matrix1.connect({
			deltaConnection: dataRuntime1.createDeltaConnection(),
			objectStorage: new MockStorage(),
		});

		const matrix2 = (await factory.load(
			dataRuntime2,
			"B",
			{
				deltaConnection: dataRuntime2.createDeltaConnection(),
				objectStorage: MockStorage.createFromSummary(summary),
			},
			factory.attributes,
		)) as SharedMatrix<number>;
		const matrix3 = (await factory.load(
			dataRuntime3,
			"C",
			{
				deltaConnection: dataRuntime3.createDeltaConnection(),
				objectStorage: MockStorage.createFromSummary(summary),
			},
			factory.attributes,
		)) as SharedMatrix<number>;

		containerRuntime3.connected = false;
		containerRuntime1.connected = false;

		matrix2.insertCols(0, 1);
		matrix1.insertCols(0, 1);
		matrix3.insertRows(0, 1);
		matrix3.setCell(0, 1, 42);

		containerRuntimeFactory.processAllMessages();
		containerRuntime2.connected = false;
		containerRuntime1.connected = true;
		containerRuntimeFactory.processAllMessages();
		containerRuntime3.connected = true;
		containerRuntimeFactory.processAllMessages();
		const expected = [[undefined, undefined, undefined, 42]];
		assert.deepEqual(extract(matrix1), expected);
		assert.deepEqual(extract(matrix3), expected);
	});
});
