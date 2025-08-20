/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { AttachState } from "@fluidframework/container-definitions";
import {
	MockContainerRuntimeFactory,
	MockFluidDataStoreRuntime,
	MockStorage,
	type MockContainerRuntime,
} from "@fluidframework/test-runtime-utils/internal";

// eslint-disable-next-line import/no-internal-modules
import type { ISharedArray } from "../../array/interfaces.js";
// eslint-disable-next-line import/no-internal-modules
import { SharedArrayFactory } from "../../array/sharedArrayFactory.js";
import { OperationType, type ISharedArrayOperation } from "../../index.js";
interface RollbackTestSetup {
	sharedArray: ISharedArray<number>;
	dataStoreRuntime: MockFluidDataStoreRuntime;
	containerRuntimeFactory: MockContainerRuntimeFactory;
	containerRuntime: MockContainerRuntime;
}
const arrayFactory = new SharedArrayFactory<number>();

function setupRollbackTest(): RollbackTestSetup {
	const containerRuntimeFactory = new MockContainerRuntimeFactory({ flushMode: 1 }); // TurnBased
	const dataStoreRuntime = new MockFluidDataStoreRuntime({ clientId: "1" });
	const containerRuntime = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime);
	const sharedArray = arrayFactory.create(dataStoreRuntime, "shared-array-1");
	dataStoreRuntime.setAttachState(AttachState.Attached);
	sharedArray.connect({
		deltaConnection: dataStoreRuntime.createDeltaConnection(),
		objectStorage: new MockStorage(),
	});
	return {
		sharedArray,
		dataStoreRuntime,
		containerRuntimeFactory,
		containerRuntime,
	};
}
// Helper to create another client attached to the same containerRuntimeFactory
function createAdditionalClient(
	containerRuntimeFactory: MockContainerRuntimeFactory,
	id: string = "client-2",
): {
	sharedArray: ISharedArray<number>;
	dataStoreRuntime: MockFluidDataStoreRuntime;
	containerRuntime: MockContainerRuntime;
} {
	const dataStoreRuntime = new MockFluidDataStoreRuntime({ clientId: id });
	const containerRuntime = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime);
	const sharedArray = arrayFactory.create(dataStoreRuntime, `shared-array-${id}`);
	dataStoreRuntime.setAttachState(AttachState.Attached);
	sharedArray.connect({
		deltaConnection: dataStoreRuntime.createDeltaConnection(),
		objectStorage: new MockStorage(),
	});
	return { sharedArray, dataStoreRuntime, containerRuntime };
}

describe("SharedArray rollback", () => {
	it("should rollback insert operation", () => {
		const { sharedArray, containerRuntime } = setupRollbackTest();
		const valueChanges: {
			op: ISharedArrayOperation;
			isLocal: boolean;
			target: ISharedArray<number>;
		}[] = [];
		sharedArray.on("valueChanged", (op, isLocal, target) => {
			valueChanges.push({ op, isLocal, target });
		});
		sharedArray.insert(0, 0);
		assert.strictEqual(sharedArray.get()[0], 0, "Failed getting pending value");
		assert.strictEqual(valueChanges.length, 1, "Should have one value change event");
		containerRuntime.rollback?.();
		assert.strictEqual(sharedArray.get()[0], undefined, "Value should be rolled back");
		assert.strictEqual(valueChanges.length, 2, "Should have two value change events");
		assert.strictEqual(
			valueChanges[1].op.type,
			OperationType.deleteEntry,
			"Second event should be for delete",
		);
	});

	it("should rollback delete operation", () => {
		const { sharedArray, containerRuntimeFactory, containerRuntime } = setupRollbackTest();
		sharedArray.insert(0, 0);
		containerRuntime.flush();
		containerRuntimeFactory.processAllMessages();
		const valueChanges: {
			op: ISharedArrayOperation;
			isLocal: boolean;
			target: ISharedArray<number>;
		}[] = [];
		sharedArray.on("valueChanged", (op, isLocal, target) => {
			valueChanges.push({ op, isLocal, target });
		});
		sharedArray.delete(0);
		assert.strictEqual(sharedArray.get().length, 0, "Pending value should reflect the delete");
		assert.strictEqual(valueChanges.length, 1, "Should have one value change event");
		containerRuntime.rollback?.();
		assert.strictEqual(sharedArray.get()[0], 0, "Value should be restored by rollback");
		assert.strictEqual(valueChanges.length, 2, "Should have two value change events");
		assert.strictEqual(
			valueChanges[1].op.type,
			OperationType.insertEntry,
			"Second event should be for insert",
		);
	});

	it("should rollback insert and delete operations", () => {
		const { sharedArray, containerRuntimeFactory, containerRuntime } = setupRollbackTest();
		const valueChanges: {
			op: ISharedArrayOperation;
			isLocal: boolean;
			target: ISharedArray<number>;
		}[] = [];
		sharedArray.insert(0, 0);
		sharedArray.insert(1, 1);
		sharedArray.insert(2, 2);
		sharedArray.delete(0); // [1,2]
		containerRuntime.flush();
		containerRuntimeFactory.processAllMessages();
		sharedArray.on("valueChanged", (op, isLocal, target) => {
			valueChanges.push({ op, isLocal, target });
		});
		sharedArray.insert(1, 5); // [1,5,2]
		sharedArray.delete(0); // [5,2]
		assert.deepStrictEqual(
			sharedArray.get(),
			[5, 2],
			"Pending value should reflect the insert and delete",
		);
		assert.strictEqual(valueChanges.length, 2, "Should have two value change events");
		containerRuntime.rollback?.();
		assert.deepStrictEqual(sharedArray.get(), [1, 2], "Values should be rolled back");
		assert.strictEqual(valueChanges.length, 4, "Should have four value change events");
	});

	it("should not resuscitate deleted entry by remote", () => {
		const { sharedArray, containerRuntimeFactory, containerRuntime } = setupRollbackTest();
		// Create a second client
		const { sharedArray: sharedArray2, containerRuntime: containerRuntime2 } =
			createAdditionalClient(containerRuntimeFactory);
		sharedArray.insert(0, 0); // [0]
		containerRuntime.flush();
		containerRuntimeFactory.processAllMessages();
		sharedArray.delete(0); // this will be rolled back but remote will delete it so it should not have any effect.
		sharedArray2.delete(0); // [] - remote delete
		containerRuntime2.flush();
		containerRuntimeFactory.processAllMessages();
		assert.deepStrictEqual(
			sharedArray.get(),
			[],
			"Array should have expected entries pre-rollback",
		);
		containerRuntime.rollback?.();
		assert.deepStrictEqual(
			sharedArray.get(),
			[],
			"Array should have expected entries post-rollback",
		);
	});

	it("should rollback insert and delete ops in presence of remote changes", () => {
		const { sharedArray, containerRuntimeFactory, containerRuntime } = setupRollbackTest();
		// Create a second client
		const { sharedArray: sharedArray2, containerRuntime: containerRuntime2 } =
			createAdditionalClient(containerRuntimeFactory);
		sharedArray.insert(0, 0); // [0]
		sharedArray.insert(1, 1); // [0,1]
		containerRuntime.flush();
		containerRuntimeFactory.processAllMessages();
		sharedArray.insert(2, 2); // this will be rolled back
		sharedArray.delete(0); // this will be rolled back
		sharedArray2.insert(2, 3); // [0,1,3]
		sharedArray2.delete(0); // [1,3]
		sharedArray2.insert(1, 12); // [1,12,3]
		sharedArray2.insert(0, 10); // [10,1,12,3]
		containerRuntime2.flush();
		containerRuntimeFactory.processAllMessages();
		assert.deepStrictEqual(
			sharedArray.get(),
			[10, 1, 2, 12, 3],
			"Array should have expected entries pre-rollback",
		);
		containerRuntime.rollback?.();
		assert.deepStrictEqual(
			sharedArray.get(),
			[10, 1, 12, 3],
			"Array should have expected entries post-rollback",
		);
		assert.deepStrictEqual(
			sharedArray2.get(),
			[10, 1, 12, 3],
			"Array should have expected entries post-rollback",
		);
	});
});
