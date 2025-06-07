/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { IFluidHandle } from "@fluidframework/core-interfaces";
import type { IChannelFactory } from "@fluidframework/datastore-definitions/internal";
import {
	MockFluidDataStoreRuntime,
	MockHandle,
	MockSharedObjectServices,
} from "@fluidframework/test-runtime-utils/internal";

import { SharedArray, type ISharedArray } from "../../index.js";
import {
	verifyEventsEmitted,
	verifyEntries,
	getRandomInt,
	verifyIFluidHandleEntries,
} from "../utilities.js";

describe("SharedArray", () => {
	let sharedArray: ISharedArray<number>;
	let factory: IChannelFactory;
	let dataStoreRuntime: MockFluidDataStoreRuntime;
	let testData: number[];
	let expectedSharedArray: number[];
	const sharedArrayEventNames: readonly string[] = ["valueChanged", "revertible"];

	beforeEach(async () => {
		dataStoreRuntime = new MockFluidDataStoreRuntime();
		factory = SharedArray.getFactory();
		sharedArray = factory.create(dataStoreRuntime, "sharedArray") as ISharedArray<number>;
		testData = [1, 2, 3, 4];
		expectedSharedArray = testData;
		let index = 0;
		for (const entry of testData) {
			sharedArray.insert(index, entry);
			index++;
		}
	});

	describe("SharedArray in local state", () => {
		beforeEach(() => {
			dataStoreRuntime.local = true;
		});

		it("Can create a new SharedArray", () => {
			assert.ok(sharedArray, "SharedArray should be created");
		});

		it("Can insert new data and get sharedArray data", () => {
			// Verify that the SharedArray has the correct values and length.
			const actualSharedArray: readonly number[] = sharedArray.get();
			verifyEntries(actualSharedArray, expectedSharedArray);
		});

		it("Can delete data and get sharedArray data", () => {
			// Prepare the expected SharedArray output
			let actualSharedArray: readonly number[] = sharedArray.get();
			const deleteIndex = getRandomInt(0, actualSharedArray.length);
			expectedSharedArray.splice(deleteIndex, 1);

			// Perform the actual operation
			sharedArray.delete(deleteIndex);

			// Verify that the SharedArray has the correct values and length.
			actualSharedArray = sharedArray.get();
			verifyEntries(
				actualSharedArray,
				expectedSharedArray,
				`deleteIndex: ${deleteIndex.toString()}`,
			);
		});

		it("Can move data and get sharedArray data", () => {
			// Case 1: oldIndex < newIndex
			let oldIndex = getRandomInt(0, testData.length - 2);
			let newIndex = oldIndex + 2;
			// Prepare the expected SharedArray output
			const deletedElementOne = expectedSharedArray.splice(oldIndex, 1);
			assert.ok(deletedElementOne[0]);
			expectedSharedArray.splice(newIndex - 1, 0, deletedElementOne[0]);

			// Perform the actual operation
			sharedArray.move(oldIndex, newIndex);

			// Verify that the SharedArray has the correct values and length.
			const actualSharedArrayOne: readonly number[] = sharedArray.get();
			verifyEntries(
				actualSharedArrayOne,
				expectedSharedArray,
				`oldIndex: ${oldIndex.toString()}, newIndex: ${newIndex.toString()}`,
			);

			// Case 2: oldIndex > newIndex
			newIndex = getRandomInt(0, testData.length - 3);
			oldIndex = newIndex + 2;
			// Prepare the expected SharedArray output
			const deletedElementTwo = expectedSharedArray.splice(oldIndex, 1);
			assert.ok(deletedElementTwo[0]);
			expectedSharedArray.splice(newIndex, 0, deletedElementTwo[0]);

			// Perform the actual operation
			sharedArray.move(oldIndex, newIndex);

			// Verify that the actual SharedArray has the correct values and length.
			const actualSharedArrayTwo: readonly number[] = sharedArray.get();
			verifyEntries(
				actualSharedArrayTwo,
				expectedSharedArray,
				`oldIndex: ${oldIndex.toString()}, newIndex: ${newIndex.toString()}`,
			);
		});

		it("Should fire correct SharedArray events", async () => {
			const dummySharedArray = sharedArray;
			let valueChangedCalled: boolean = false;
			let revertibleCalled: boolean = false;
			dummySharedArray.on("valueChanged", () => {
				valueChangedCalled = true;
			});
			dummySharedArray.on("revertible", () => {
				revertibleCalled = true;
			});

			// Perform the actual operation
			dummySharedArray.insert(0, 4);

			// Verify that the correct events are called
			verifyEventsEmitted(
				[valueChangedCalled, revertibleCalled],
				[true, true],
				sharedArrayEventNames,
			);
		});

		describe("SharedArray Snapshot", () => {
			it("Can load a SharedArray from snapshot", async () => {
				// Load a new SharedArray from the snapshot of the first one.
				const services = MockSharedObjectServices.createFromSummary(
					sharedArray.getAttachSummary().summary,
				);
				const attributes = {
					type: factory.type,
					snapshotFormatVersion: factory.attributes.snapshotFormatVersion,
				};
				const sharedArrayTwo = (await factory.load(
					dataStoreRuntime,
					"sharedArrayTwo",
					services,
					attributes,
				)) as ISharedArray<number>;

				// Verify that the new SharedArray has the correct values and length.
				const actualSharedArray: readonly number[] = sharedArrayTwo.get();
				verifyEntries(actualSharedArray, expectedSharedArray);
			});
		});

		describe("SharedArray IFluidHandle as value", () => {
			let sharedArrayIFluidHandle: ISharedArray<IFluidHandle>;
			let testDataIFluidHandle: IFluidHandle[];
			let expectedSharedArrayIFluidHandle: IFluidHandle[];
			const mockHandle = new MockHandle({});

			beforeEach(() => {
				sharedArrayIFluidHandle = factory.create(
					dataStoreRuntime,
					"sharedArrayIFluidHandle",
				) as ISharedArray<IFluidHandle>;
				testDataIFluidHandle = [mockHandle];
				expectedSharedArrayIFluidHandle = testDataIFluidHandle;
				// Fill the sharedArray with a few entries
				let index = 0;
				for (const entry of testDataIFluidHandle) {
					sharedArrayIFluidHandle.insert(index, entry);
					index++;
				}
			});

			it("Can insert new data and get sharedArray data", async () => {
				// Verify that the SharedArray has the correct values and length.
				const actualSharedArray = sharedArrayIFluidHandle.get();
				verifyIFluidHandleEntries(actualSharedArray, expectedSharedArrayIFluidHandle);
			});

			it("Can load a SharedArray from snapshot", async () => {
				// Load a new SharedArray from the snapshot of the first one.
				const services = MockSharedObjectServices.createFromSummary(
					sharedArrayIFluidHandle.getAttachSummary().summary,
				);

				const attributes = {
					type: factory.type,
					snapshotFormatVersion: factory.attributes.snapshotFormatVersion,
				};
				const sharedArrayTwo = (await factory.load(
					dataStoreRuntime,
					"sharedArrayTwo",
					services,
					attributes,
				)) as ISharedArray<IFluidHandle>;

				// Verify that the new SharedArray has the correct values and length.
				const actualSharedArray = sharedArrayTwo.get();
				verifyIFluidHandleEntries(actualSharedArray, expectedSharedArrayIFluidHandle);
			});
		});
	});
});
