/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { IChannelFactory } from "@fluidframework/datastore-definitions/internal";
import {
	MockFluidDataStoreRuntime,
	MockContainerRuntimeFactoryForReconnection,
	MockStorage,
} from "@fluidframework/test-runtime-utils/internal";
import type { MockContainerRuntimeForReconnection } from "@fluidframework/test-runtime-utils/internal";

import { SharedArray } from "../../index.js";
import { verifyEntries, fillEntries, getRandomInt } from "../utilities.js";

describe("SharedArray", () => {
	let sharedArray: SharedArray<number>;
	let factory: IChannelFactory;
	let dataStoreRuntime: MockFluidDataStoreRuntime;
	let testDataOne: number[];
	let testDataTwo: number[];
	let expectedSharedArrayAfterFirstConverge: number[];
	let expectedSharedArrayAfterSecondConverge: number[];

	beforeEach(async () => {
		dataStoreRuntime = new MockFluidDataStoreRuntime();
		factory = SharedArray.getFactory();
		sharedArray = factory.create(dataStoreRuntime, "sharedArray") as SharedArray<number>;
		testDataOne = [1, 2];
		testDataTwo = [3, 4];
		expectedSharedArrayAfterFirstConverge = testDataOne;
		expectedSharedArrayAfterSecondConverge = [...testDataTwo, ...testDataOne];
	});

	describe("SharedArray reconnection flow", () => {
		let containerRuntimeFactory: MockContainerRuntimeFactoryForReconnection;
		let containerRuntime1: MockContainerRuntimeForReconnection;
		let containerRuntime2: MockContainerRuntimeForReconnection;
		let remoteSharedArray: SharedArray<number>;

		beforeEach(() => {
			containerRuntimeFactory = new MockContainerRuntimeFactoryForReconnection();

			// Connect the first SharedArray.
			dataStoreRuntime.local = false;
			containerRuntime1 = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime);
			const services1 = {
				deltaConnection: containerRuntime1.createDeltaConnection(),
				objectStorage: new MockStorage(),
			};
			sharedArray.connect(services1);

			// Create and connect a second SharedArray.
			const dataStoreRuntime2 = new MockFluidDataStoreRuntime();
			containerRuntime2 = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime2);
			const services2 = {
				deltaConnection: containerRuntime2.createDeltaConnection(),
				objectStorage: new MockStorage(),
			};

			remoteSharedArray = factory.create(
				dataStoreRuntime2,
				"remoteSharedArray",
			) as SharedArray<number>;
			remoteSharedArray.connect(services2);
		});

		it("can resend unacknowledged ops on reconnection", async () => {
			// Perform the insert operation in first client.
			fillEntries(sharedArray, testDataOne);

			// Disconnect and reconnect the first client.
			containerRuntime1.connected = false;
			containerRuntime1.connected = true;

			containerRuntimeFactory.processAllMessages();

			// Verify that the first and second client have the correct values and length and that they have converged.
			let actualSharedArray = [...sharedArray.get()];
			let actualRemoteSharedArray = [...remoteSharedArray.get()];
			verifyEntries(actualSharedArray, expectedSharedArrayAfterFirstConverge);
			verifyEntries(actualRemoteSharedArray, actualSharedArray);

			// Perform the insert operation in the second client.
			fillEntries(remoteSharedArray, testDataTwo);

			// Disconnect and reconnect the second client.
			containerRuntime2.connected = false;
			containerRuntime2.connected = true;

			containerRuntimeFactory.processAllMessages();

			// Verify that the first and second client have the correct values and length and that they have converged.
			actualRemoteSharedArray = [...remoteSharedArray.get()];
			actualSharedArray = [...sharedArray.get()];
			verifyEntries(actualRemoteSharedArray, expectedSharedArrayAfterSecondConverge);
			verifyEntries(actualSharedArray, actualRemoteSharedArray);
		});

		it("can store insert ops in disconnected state and resend them on reconnection", async () => {
			// Disconnect the first client.
			containerRuntime1.connected = false;

			// Perform the insert operation in first client.
			fillEntries(sharedArray, testDataOne);

			// Reconnect the first client.
			containerRuntime1.connected = true;

			containerRuntimeFactory.processAllMessages();

			// Verify that the first and second client have the correct values and length and that they have converged.
			let actualSharedArray = [...sharedArray.get()];
			let actualRemoteSharedArray = [...remoteSharedArray.get()];
			verifyEntries(actualSharedArray, expectedSharedArrayAfterFirstConverge);
			verifyEntries(actualRemoteSharedArray, actualSharedArray);

			// Disconnect the second client.
			containerRuntime2.connected = false;

			// Perform the insert operation in the second client.
			fillEntries(remoteSharedArray, testDataTwo);

			// Reconnect the second client.
			containerRuntime2.connected = true;

			containerRuntimeFactory.processAllMessages();

			// Verify that the first and second client have the correct values and length and that they have converged.
			actualRemoteSharedArray = [...remoteSharedArray.get()];
			actualSharedArray = [...sharedArray.get()];
			verifyEntries(actualRemoteSharedArray, expectedSharedArrayAfterSecondConverge);
			verifyEntries(actualSharedArray, actualRemoteSharedArray);
		});

		it("can store delete op in disconnected state and resend it on reconnection", async () => {
			// Fill in some entries in the shared array.
			fillEntries(sharedArray, [...testDataOne, ...testDataTwo]);

			// Prepare the expected output after first converge.
			const expectedSharedArray = [...testDataOne, ...testDataTwo];
			expectedSharedArray.shift();

			// Disconnect the first client.
			containerRuntime1.connected = false;

			// Perform the deletion operation in first client.
			sharedArray.delete(0);

			// Reconnect the first client.
			containerRuntime1.connected = true;

			containerRuntimeFactory.processAllMessages();

			// Verify that the first and second client have the correct values and length and that they have converged.
			let actualSharedArray = [...sharedArray.get()];
			let actualRemoteSharedArray = [...remoteSharedArray.get()];
			verifyEntries(actualSharedArray, expectedSharedArray);
			verifyEntries(actualRemoteSharedArray, actualSharedArray);

			// Prepare the expected output after second converge.
			expectedSharedArray.shift();

			// Disconnect the second client.
			containerRuntime2.connected = false;

			// Perform the deletion operation in second client.
			remoteSharedArray.delete(0);

			// Reconnect the second client.
			containerRuntime2.connected = true;

			containerRuntimeFactory.processAllMessages();

			// Verify that the first and second client have the correct values and length and that they have converged.
			actualRemoteSharedArray = [...remoteSharedArray.get()];
			actualSharedArray = [...sharedArray.get()];
			verifyEntries(actualRemoteSharedArray, expectedSharedArray);
			verifyEntries(actualSharedArray, actualRemoteSharedArray);
		});

		it("can store move op in disconnected state and resend it on reconnection", async () => {
			// Fill in some entries in the shared array.
			fillEntries(sharedArray, [...testDataOne, ...testDataTwo]);

			// Prepare the expected output after first converge.
			let oldIndex = 0;
			let newIndex = 3; // newIndex>oldIndex
			const expectedSharedArray = [...testDataOne, ...testDataTwo]; // [1, 2, 3, 4]
			let deletedElement = expectedSharedArray.splice(oldIndex, 1);
			assert.ok(deletedElement[0]);
			expectedSharedArray.splice(newIndex - 1, 0, deletedElement[0]); // [2, 3, 1, 4]

			// Disconnect the first client.
			containerRuntime1.connected = false;

			// Perform the move operation in first client.
			sharedArray.move(oldIndex, newIndex);

			// Reconnect the first client.
			containerRuntime1.connected = true;

			containerRuntimeFactory.processAllMessages();

			// Verify that the first and second client have the correct values and length and that they have converged.
			let actualSharedArray = [...sharedArray.get()];
			let actualRemoteSharedArray = [...remoteSharedArray.get()];
			verifyEntries(actualSharedArray, expectedSharedArray);
			verifyEntries(actualRemoteSharedArray, actualSharedArray);

			// Prepare the expected output after second converge
			oldIndex = 3;
			newIndex = 1; // newIndex<oldIndex
			deletedElement = expectedSharedArray.splice(oldIndex, 1);
			assert.ok(deletedElement[0]);
			expectedSharedArray.splice(newIndex, 0, deletedElement[0]); // [2, 4, 3, 1]

			// Disconnect the second client.
			containerRuntime2.connected = false;

			// Perform the move operation in second client.
			remoteSharedArray.move(oldIndex, newIndex);

			// Reconnect the second client.
			containerRuntime2.connected = true;

			containerRuntimeFactory.processAllMessages();

			// Verify that the first and second client have the correct values and length and that they have converged.
			actualRemoteSharedArray = [...remoteSharedArray.get()];
			actualSharedArray = [...sharedArray.get()];
			verifyEntries(actualRemoteSharedArray, expectedSharedArray);
			verifyEntries(actualSharedArray, actualRemoteSharedArray);
		});

		// With this describe module we are trying to simulate and test concurrency scenarios.
		describe("SharedArray data consistency on reconnection", () => {
			let expectedSharedArray: number[];

			beforeEach(() => {
				// Prepare test data.
				const testData: number[] = [...testDataOne, ...testDataTwo];

				// Fill in some entries in the shared array.
				fillEntries(sharedArray, testData);

				// Make sure the remote client also has the same test data entries.
				containerRuntimeFactory.processAllMessages();

				// Expected shared array output.
				expectedSharedArray = testData; // [1, 2, 3, 4]

				// Disconnect the first client.
				containerRuntime1.connected = false;

				// Disconnect the second client.
				containerRuntime2.connected = false;
			});

			it("Insert operation at same position on multiple offline clients should converge after reconnection", async () => {
				// Choose a random deletion index.
				const insertionIndex = getRandomInt(0, sharedArray.get().length);

				// Perform the insert operation in first client.
				sharedArray.insert(insertionIndex, 10);
				// Perform the insert operation in second client with a different value but at the same position.
				remoteSharedArray.insert(insertionIndex, 15);

				// Reconnect the first client.
				containerRuntime1.connected = true;
				// Reconnect the second client.
				containerRuntime2.connected = true;

				containerRuntimeFactory.processAllMessages();

				// Verify that the first and second client have converged.
				// Note: The expected order of elements is not deterministic in this case and depends on the DDS merge policy.
				const actualRemoteSharedArray = [...remoteSharedArray.get()];
				const actualSharedArray = [...sharedArray.get()];
				verifyEntries(
					actualRemoteSharedArray,
					actualSharedArray,
					`insertionIndex: ${insertionIndex.toString()}`,
				);
			});

			it("Delete operation at same position on multiple offline clients should coalesce after reconnection", async () => {
				// Choose a random deletion index.
				const deletionIndex = getRandomInt(0, sharedArray.get().length);

				// Prepare the expected output after we reconnect both clients.
				expectedSharedArray.splice(deletionIndex, 1);

				// Perform the delete operation in first client.
				sharedArray.delete(deletionIndex);
				// Perform the delete operation in second client.
				remoteSharedArray.delete(deletionIndex);

				// Reconnect the first client.
				containerRuntime1.connected = true;
				// Reconnect the second client.
				containerRuntime2.connected = true;

				containerRuntimeFactory.processAllMessages();

				// Verify that the first and second client have the correct values and length and that they have converged.
				const actualRemoteSharedArray = [...remoteSharedArray.get()];
				const actualSharedArray = [...sharedArray.get()];
				verifyEntries(
					actualSharedArray,
					expectedSharedArray,
					`deletionIndex: ${deletionIndex.toString()}`,
				);
				verifyEntries(
					actualRemoteSharedArray,
					actualSharedArray,
					`deletionIndex: ${deletionIndex.toString()}`,
				);
			});

			it("Moving an element at one client and deleting the same element on another client should converge after reconnection", async () => {
				// Case: oldIndex < newIndex: Choose a random old index.
				const oldIndex = getRandomInt(0, sharedArray.get().length - 2);
				// Choose a valid new index.
				const newIndex = oldIndex + 2;

				// Prepare the expected output after we reconnect both clients.
				expectedSharedArray.splice(oldIndex, 1);

				// Perform the delete operation in first client.
				sharedArray.delete(oldIndex);
				// Perform the move operation in second client.
				remoteSharedArray.move(oldIndex, newIndex);

				// Reconnect the first client.
				containerRuntime1.connected = true;
				// Reconnect the second client.
				containerRuntime2.connected = true;

				containerRuntimeFactory.processAllMessages();

				// Verify that the first and second client have the correct values and length and that they have converged.
				const actualRemoteSharedArray = [...remoteSharedArray.get()];
				const actualSharedArray = [...sharedArray.get()];
				verifyEntries(
					actualSharedArray,
					expectedSharedArray,
					`oldIndex: ${oldIndex.toString()}newIndex: ${newIndex.toString()}`,
				);
				verifyEntries(
					actualRemoteSharedArray,
					actualSharedArray,
					`oldIndex: ${oldIndex.toString()}newIndex: ${newIndex.toString()}`,
				);
			});

			it("Moving two different elements should converge after reconnection", async () => {
				// Case: oldIndex < newIndex.
				const firstOldIndex = 0;
				// Choose a valid new index.
				const firstNewIndex = sharedArray.get().length;

				// Case: oldIndex > newIndex.
				const secondNewIndex = 0;
				// Choose a valid old index.
				const secondOldIndex = sharedArray.get().length - 1;

				// Prepare the expected output after we reconnect both clients.
				const firstDeletedElement = expectedSharedArray.splice(firstOldIndex, 1);
				const secondDeletedElement = expectedSharedArray.splice(secondOldIndex - 1, 1);
				assert.ok(firstDeletedElement[0]);
				assert.ok(secondDeletedElement[0]);
				expectedSharedArray.splice(firstNewIndex - 2, 0, firstDeletedElement[0]); // [2,3] -> [2,3,1]
				expectedSharedArray.splice(secondNewIndex, 0, secondDeletedElement[0]); // [2,3,1] -> [4,2,3,1]

				// Perform the actual operation in both clients.
				sharedArray.move(firstOldIndex, firstNewIndex);
				remoteSharedArray.move(secondOldIndex, secondNewIndex);

				// Reconnect the first client.
				containerRuntime1.connected = true;
				// Reconnect the second client.
				containerRuntime2.connected = true;

				containerRuntimeFactory.processAllMessages();

				// Verify that the first and second client have the correct values and length and that they have converged.
				const actualRemoteSharedArray = [...remoteSharedArray.get()];
				const actualSharedArray = [...sharedArray.get()];
				verifyEntries(
					actualSharedArray,
					expectedSharedArray,
					`firstOldIndex: ${firstOldIndex.toString()} firstNewIndex: ${firstNewIndex.toString()} secondOldIndex: ${secondOldIndex.toString()} secondNewIndex: ${secondNewIndex.toString()}`,
				);
				verifyEntries(
					actualRemoteSharedArray,
					actualSharedArray,
					`firstOldIndex: ${firstOldIndex.toString()} firstNewIndex: ${firstNewIndex.toString()} secondOldIndex: ${secondOldIndex.toString()} secondNewIndex: ${secondNewIndex.toString()}`,
				);
			});

			it("Moving same element in two different clients should converge after reconnection", async () => {
				// Choose an old index.
				const firstOldIndex = sharedArray.get().length / 2;
				// Choose valid new indices.
				const firstNewIndex = 0; // Case: oldIndex > newIndex:
				const secondNewIndex = sharedArray.get().length; // Case: oldIndex < newIndex:

				// Perform the actual operation in both clients.
				sharedArray.move(firstOldIndex, firstNewIndex);
				remoteSharedArray.move(firstOldIndex, secondNewIndex);

				// Reconnect the first client.
				containerRuntime1.connected = true;
				// Reconnect the second client.
				containerRuntime2.connected = true;

				containerRuntimeFactory.processAllMessages();

				// Verify that the first and second client have converged.
				// Note: Here the expected output is not deterministic as either the first client's or the second client's change will win as per the DDS merge policy.
				const actualRemoteSharedArray = [...remoteSharedArray.get()];
				const actualSharedArray = [...sharedArray.get()];
				verifyEntries(
					actualRemoteSharedArray,
					actualSharedArray,
					`firstOldIndex: ${firstOldIndex.toString()} firstNewIndex: ${firstNewIndex.toString()} secondNewIndex: ${secondNewIndex.toString()}`,
				);
			});
		});
	});
});
