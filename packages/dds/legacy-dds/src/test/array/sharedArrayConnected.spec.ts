/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { IFluidHandle } from "@fluidframework/core-interfaces";
import type { IChannelFactory } from "@fluidframework/datastore-definitions/internal";
import {
	MockFluidDataStoreRuntime,
	MockContainerRuntimeFactory,
	MockStorage,
	MockHandle,
} from "@fluidframework/test-runtime-utils/internal";

import type { IToggleOperation, IToggleMoveOperation, IRevertible } from "../../index.js";
import { SharedArray, SharedArrayRevertible } from "../../index.js";
import {
	verifyEventsEmitted,
	verifyEntries,
	getRandomInt,
	fillEntries,
	verifyIFluidHandleEntries,
} from "../utilities.js";

describe("SharedArray", () => {
	let sharedArray: SharedArray<number>;
	let factory: IChannelFactory;
	let dataStoreRuntime: MockFluidDataStoreRuntime;
	let testData: number[];
	let expectedSharedArray: number[];

	beforeEach(async () => {
		dataStoreRuntime = new MockFluidDataStoreRuntime();
		factory = SharedArray.getFactory();
		sharedArray = factory.create(dataStoreRuntime, "sharedArray") as SharedArray<number>;
		testData = [1, 2, 3, 4];
		expectedSharedArray = testData;
	});

	describe("SharedArray in connected state with a remote SharedArray", () => {
		let remoteSharedArray: SharedArray<number>;
		let containerRuntimeFactory: MockContainerRuntimeFactory;

		beforeEach(async () => {
			containerRuntimeFactory = new MockContainerRuntimeFactory();

			// Connect the first SharedArray.
			dataStoreRuntime.local = false;
			const containerRuntime1 =
				containerRuntimeFactory.createContainerRuntime(dataStoreRuntime);
			const services1 = {
				deltaConnection: containerRuntime1.createDeltaConnection(),
				objectStorage: new MockStorage(),
			};
			sharedArray.connect(services1);

			// Create and connect a second SharedArray.
			const dataStoreRuntime2 = new MockFluidDataStoreRuntime();
			const containerRuntime2 =
				containerRuntimeFactory.createContainerRuntime(dataStoreRuntime2);
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

		describe("Insert operation", () => {
			it("Can insert data multiple times and converge", () => {
				// Perform the actual operation
				// We insert a few entries in both the local and remote DDS
				fillEntries(sharedArray, testData.splice(0, 2)); // [1,2]
				fillEntries(remoteSharedArray, testData); // [3,4]

				containerRuntimeFactory.processAllMessages();

				const actualSharedArray: number[] = [...sharedArray.get()];
				const actualSharedArrayRemote = remoteSharedArray.get();
				// Verify that the first client and second client have converged.
				verifyEntries(actualSharedArrayRemote, actualSharedArray);
			});

			it("Fires correct events after insertion", () => {
				// Attach the event listeners
				let valueChangedCalled: boolean = false;
				let revertibleCalled: boolean = false;
				remoteSharedArray.on("valueChanged", () => {
					valueChangedCalled = true;
				});
				sharedArray.on("revertible", () => {
					revertibleCalled = true;
				});

				// Perform the actual operation
				sharedArray.insert(0, 10);

				containerRuntimeFactory.processAllMessages();

				// Verify that the correct events are called
				verifyEventsEmitted(
					[valueChangedCalled, revertibleCalled],
					[true, true],
					["valueChanged", "revertible"],
				);
			});

			describe("Undo and Redo for insert op", () => {
				beforeEach(() => {
					// Fill the sharedArray with a few entries.
					fillEntries(sharedArray, testData);
					containerRuntimeFactory.processAllMessages();
				});

				it("Can undo", () => {
					// Choose a random insertion index.
					const insertIndex = getRandomInt(0, sharedArray.get().length + 1);

					let revertible: IRevertible = new SharedArrayRevertible(sharedArray, {
						entryId: "dummy",
						type: 3,
						isDeleted: false,
					} satisfies IToggleOperation);

					// Attach the revertible event listener.
					sharedArray.on("revertible", (revertibleItem: SharedArrayRevertible) => {
						revertible = revertibleItem as IRevertible;
					});

					// Perform the actual operation.
					sharedArray.insert(insertIndex, 10);

					containerRuntimeFactory.processAllMessages();

					// Perform the undo.
					revertible.revert();

					containerRuntimeFactory.processAllMessages();

					const actualSharedArray = [...sharedArray.get()];
					const actualSharedArrayRemote = remoteSharedArray.get();
					// Verify that the expected and actual output match.
					verifyEntries(
						actualSharedArray,
						expectedSharedArray,
						`insertIndex: ${insertIndex.toString()}`,
					);
					// Verify that the first client and second client have converged.
					verifyEntries(
						actualSharedArrayRemote,
						actualSharedArray,
						`insertIndex: ${insertIndex.toString()}`,
					);
				});

				it("Can redo", () => {
					// Choose a random insertion index.
					const insertIndex = getRandomInt(0, sharedArray.get().length + 1);
					const insertValue = 10;

					// Prepare the expected SharedArray output.
					expectedSharedArray.splice(insertIndex, 0, insertValue);

					let revertible: IRevertible = new SharedArrayRevertible(sharedArray, {
						entryId: "dummy",
						type: 3,
						isDeleted: false,
					} satisfies IToggleOperation);

					// Attach the revertible event listener.
					sharedArray.on("revertible", (revertibleItem: SharedArrayRevertible) => {
						revertible = revertibleItem as IRevertible;
					});

					// Perform the actual operation.
					sharedArray.insert(insertIndex, insertValue);

					containerRuntimeFactory.processAllMessages();

					// Perform the undo.
					revertible.revert();

					containerRuntimeFactory.processAllMessages();

					// Perform the redo.
					revertible.revert();

					containerRuntimeFactory.processAllMessages();

					const actualSharedArray = [...sharedArray.get()];
					const actualSharedArrayRemote = remoteSharedArray.get();
					// Verify that the expected and actual output match.
					verifyEntries(
						actualSharedArray,
						expectedSharedArray,
						`insertIndex: ${insertIndex.toString()}`,
					);
					// Verify that the first client and second client have converged.
					verifyEntries(
						actualSharedArrayRemote,
						actualSharedArray,
						`insertIndex: ${insertIndex.toString()}`,
					);
				});
			});

			it("Throws on invalid input index", () => {
				// Should throw for negative insertion index
				assert.throws(() => {
					sharedArray.insert(-1, 10);
				});
			});
		});

		describe("Delete operation", () => {
			beforeEach(() => {
				// Fill the sharedArray with a few entries
				fillEntries(sharedArray, testData);
				containerRuntimeFactory.processAllMessages();
			});

			it("Can delete data and converge", () => {
				// Prepare the expected SharedArray output
				let actualSharedArray = [...sharedArray.get()];
				const deleteIndex = getRandomInt(0, actualSharedArray.length);
				expectedSharedArray.splice(deleteIndex, 1);

				// Perform the actual operation
				sharedArray.delete(deleteIndex);

				containerRuntimeFactory.processAllMessages();

				actualSharedArray = [...sharedArray.get()];
				const actualSharedArrayRemote = remoteSharedArray.get();
				// Verify that the expected and actual output match.
				verifyEntries(
					actualSharedArray,
					expectedSharedArray,
					`deleteIndex: ${deleteIndex.toString()}`,
				);
				// Verify that the first client and second client have converged.
				verifyEntries(
					actualSharedArrayRemote,
					actualSharedArray,
					`deleteIndex: ${deleteIndex.toString()}`,
				);
			});

			it("Should fire correct SharedArray events", () => {
				// Attach the event listeners
				let valueChangedCalled: boolean = false;
				let revertibleCalled: boolean = false;
				remoteSharedArray.on("valueChanged", () => {
					valueChangedCalled = true;
				});
				sharedArray.on("revertible", () => {
					revertibleCalled = true;
				});

				// Perform the actual operation
				sharedArray.delete(0);

				containerRuntimeFactory.processAllMessages();

				// Verify that the correct events are called
				verifyEventsEmitted(
					[valueChangedCalled, revertibleCalled],
					[true, true],
					["valueChanged", "revertible"],
				);
			});

			describe("Undo and Redo for delete op", () => {
				it("Can undo", () => {
					// Choose a random deletion index.
					const deleteIndex = getRandomInt(0, sharedArray.get().length);

					let revertible: IRevertible = new SharedArrayRevertible(sharedArray, {
						entryId: "dummy",
						type: 3,
						isDeleted: false,
					} satisfies IToggleOperation);

					// Attach the revertible event listener.
					sharedArray.on("revertible", (revertibleItem: SharedArrayRevertible) => {
						revertible = revertibleItem as IRevertible;
					});

					// Perform the actual operation.
					sharedArray.delete(deleteIndex);

					containerRuntimeFactory.processAllMessages();

					// Perform the undo.
					revertible.revert();

					containerRuntimeFactory.processAllMessages();

					const actualSharedArray = [...sharedArray.get()];
					const actualSharedArrayRemote = remoteSharedArray.get();
					// Verify that the expected and actual output match.
					verifyEntries(
						actualSharedArray,
						expectedSharedArray,
						`deleteIndex: ${deleteIndex.toString()}`,
					);
					// Verify that the first client and second client have converged.
					verifyEntries(
						actualSharedArrayRemote,
						actualSharedArray,
						`deleteIndex: ${deleteIndex.toString()}`,
					);
				});

				it("Can redo", () => {
					// Choose a random deletion index.
					const deleteIndex = getRandomInt(0, sharedArray.get().length);

					// Prepare the expected SharedArray output.
					expectedSharedArray.splice(deleteIndex, 1);

					let revertible: IRevertible = new SharedArrayRevertible(sharedArray, {
						entryId: "dummy",
						type: 3,
						isDeleted: false,
					} satisfies IToggleOperation);

					// Attach the revertible event listener.
					sharedArray.on("revertible", (revertibleItem: SharedArrayRevertible) => {
						revertible = revertibleItem as IRevertible;
					});

					// Perform the actual operation.
					sharedArray.delete(deleteIndex);

					containerRuntimeFactory.processAllMessages();

					// Perform the undo.
					revertible.revert();

					containerRuntimeFactory.processAllMessages();

					// Perform the redo.
					revertible.revert();

					containerRuntimeFactory.processAllMessages();

					const actualSharedArray = [...sharedArray.get()];
					const actualSharedArrayRemote = remoteSharedArray.get();
					// Verify that the expected and actual output match.
					verifyEntries(
						actualSharedArray,
						expectedSharedArray,
						`deleteIndex: ${deleteIndex.toString()}`,
					);
					// Verify that the first client and second client have converged.
					verifyEntries(
						actualSharedArrayRemote,
						actualSharedArray,
						`deleteIndex: ${deleteIndex.toString()}`,
					);
				});

				it("Throws on invalid input index", () => {
					assert.throws(() => {
						sharedArray.delete(-1);
					});
					// Should throw for negative deletion index
				});
			});
		});

		describe("Move operation", () => {
			beforeEach(() => {
				// Fill the sharedArray with a few entries
				fillEntries(sharedArray, testData);
				containerRuntimeFactory.processAllMessages();
			});

			it("Can move data and converge", () => {
				const oldIndex = getRandomInt(0, sharedArray.get().length - 2);
				const newIndex = oldIndex + 2;
				// Prepare the expected SharedArray output
				const deletedElementOne = expectedSharedArray.splice(oldIndex, 1);
				assert.ok(deletedElementOne[0]);
				expectedSharedArray.splice(newIndex - 1, 0, deletedElementOne[0]);

				// Perform the actual operation
				sharedArray.move(oldIndex, newIndex);

				containerRuntimeFactory.processAllMessages();

				const actualSharedArray = [...sharedArray.get()];
				const actualSharedArrayRemote = remoteSharedArray.get();
				// Verify that the expected and actual output match.
				verifyEntries(
					actualSharedArray,
					expectedSharedArray,
					`oldIndex: ${oldIndex.toString()}, newIndex: ${newIndex.toString()}`,
				);
				// Verify that the first client and second client have converged.
				verifyEntries(
					actualSharedArrayRemote,
					actualSharedArray,
					`oldIndex: ${oldIndex.toString()}, newIndex: ${newIndex.toString()}`,
				);
			});

			it("Should fire correct SharedArray events", () => {
				// Attach the event listeners
				let valueChangedCalled: boolean = false;
				let revertibleCalled: boolean = false;
				remoteSharedArray.on("valueChanged", () => {
					valueChangedCalled = true;
				});
				sharedArray.on("revertible", () => {
					revertibleCalled = true;
				});

				// Perform the actual operation
				sharedArray.move(0, 2);

				containerRuntimeFactory.processAllMessages();

				// Verify that the correct events are called
				verifyEventsEmitted(
					[valueChangedCalled, revertibleCalled],
					[true, true],
					["valueChanged", "revertible"],
				);
			});

			describe("Undo and Redo for move op", () => {
				it("Can undo", () => {
					// Case: oldIndex < newIndex: Choose a random old index.
					const oldIndex = getRandomInt(0, testData.length - 2);
					// Choose a valid new index.
					const newIndex = oldIndex + 2;

					let revertible: IRevertible = new SharedArrayRevertible(sharedArray, {
						entryId: "dummy",
						changedToEntryId: "dummy",
						type: 4,
					} satisfies IToggleMoveOperation);

					// Attach the revertible event listener.
					sharedArray.on("revertible", (revertibleItem: SharedArrayRevertible) => {
						revertible = revertibleItem as IRevertible;
					});

					// Perform the actual operation.
					sharedArray.move(oldIndex, newIndex);

					containerRuntimeFactory.processAllMessages();

					// Perform the undo.
					revertible.revert();

					containerRuntimeFactory.processAllMessages();

					const actualSharedArray = [...sharedArray.get()];
					const actualSharedArrayRemote = remoteSharedArray.get();
					// Verify that the expected and actual output match.
					verifyEntries(
						actualSharedArray,
						expectedSharedArray,
						`oldIndex: ${oldIndex.toString()}, newIndex: ${newIndex.toString()}`,
					);
					// Verify that the first client and second client have converged.
					verifyEntries(
						actualSharedArrayRemote,
						actualSharedArray,
						`oldIndex: ${oldIndex.toString()}, newIndex: ${newIndex.toString()}`,
					);
				});

				it("Can redo", () => {
					// Case: oldIndex < newIndex: Choose a random old index.
					const oldIndex = getRandomInt(0, sharedArray.get().length - 2);
					// Choose a valid new index.
					const newIndex = oldIndex + 2;

					// Prepare the expected SharedArray output.
					const deletedElement = expectedSharedArray.splice(oldIndex, 1);
					assert.ok(deletedElement[0]);
					expectedSharedArray.splice(newIndex - 1, 0, deletedElement[0]);

					let revertible: IRevertible = new SharedArrayRevertible(sharedArray, {
						entryId: "dummy",
						changedToEntryId: "dummy",
						type: 4,
					} satisfies IToggleMoveOperation);

					// Attach the revertible event listener.
					sharedArray.on("revertible", (revertibleItem: SharedArrayRevertible) => {
						revertible = revertibleItem as IRevertible;
					});

					// Perform the actual operation.
					sharedArray.move(oldIndex, newIndex);

					containerRuntimeFactory.processAllMessages();

					// Perform the undo.
					revertible.revert();

					containerRuntimeFactory.processAllMessages();

					// Perform the redo.
					revertible.revert();

					containerRuntimeFactory.processAllMessages();

					const actualSharedArray = [...sharedArray.get()];
					const actualSharedArrayRemote = remoteSharedArray.get();
					// Verify that the expected and actual output match.
					verifyEntries(
						actualSharedArray,
						expectedSharedArray,
						`oldIndex: ${oldIndex.toString()}, newIndex: ${newIndex.toString()}`,
					);
					// Verify that the first client and second client have converged.
					verifyEntries(
						actualSharedArrayRemote,
						actualSharedArray,
						`oldIndex: ${oldIndex.toString()}, newIndex: ${newIndex.toString()}`,
					);
				});
			});

			describe("Throws on invalid input index", () => {
				it("Throws on negative input for old index", () => {
					assert.throws(() => {
						sharedArray.move(-1, 2);
					});
					// Should throw on negative input for old index
				});

				it("Throws on negative input for new index", () => {
					assert.throws(() => {
						sharedArray.move(0, -1);
					});
					// Should throw on negative input new index
				});
			});
		});
	});
});

describe("SharedArray in connected state with a remote SharedArray with IFluidHandle", () => {
	let factory: IChannelFactory;
	let dataStoreRuntime: MockFluidDataStoreRuntime;
	let localSharedArray: SharedArray<IFluidHandle>;
	let remoteSharedArray: SharedArray<IFluidHandle>;
	let containerRuntimeFactory: MockContainerRuntimeFactory;
	// const mockHandle = new MockHandle({});

	beforeEach(async () => {
		factory = SharedArray.getFactory();
		dataStoreRuntime = new MockFluidDataStoreRuntime();
		containerRuntimeFactory = new MockContainerRuntimeFactory();

		// Connect the first SharedArray.
		dataStoreRuntime.local = false;
		const containerRuntime1 = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime);
		const services1 = {
			deltaConnection: containerRuntime1.createDeltaConnection(),
			objectStorage: new MockStorage(),
		};
		localSharedArray = factory.create(
			dataStoreRuntime,
			"sharedArrayIFluidHandle",
		) as SharedArray<IFluidHandle>;
		localSharedArray.connect(services1);

		// Create and connect a second SharedArray.
		const dataStoreRuntime2 = new MockFluidDataStoreRuntime();
		const containerRuntime2 =
			containerRuntimeFactory.createContainerRuntime(dataStoreRuntime2);
		const services2 = {
			deltaConnection: containerRuntime2.createDeltaConnection(),
			objectStorage: new MockStorage(),
		};

		remoteSharedArray = factory.create(
			dataStoreRuntime2,
			"remoteSharedArrayId",
		) as SharedArray<IFluidHandle>;
		remoteSharedArray.connect(services2);
	});

	it("Verify IfluidHandle remote", async () => {
		// Perform the actual operation
		// We insert a few entries in both the local and remote DDS
		const mockHandle = new MockHandle({});
		localSharedArray.insert(0, mockHandle);

		containerRuntimeFactory.processAllMessages();

		const localSharedArrayValues = localSharedArray.get();
		const remoteSharedArrayValues = remoteSharedArray.get();

		// Verify that the first client and second client have converged.
		verifyIFluidHandleEntries(localSharedArrayValues, remoteSharedArrayValues);
	});
});
