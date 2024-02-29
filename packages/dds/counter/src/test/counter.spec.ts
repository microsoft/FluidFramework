/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { type IChannelFactory } from "@fluidframework/datastore-definitions";
import {
	MockFluidDataStoreRuntime,
	MockContainerRuntimeFactory,
	MockContainerRuntimeFactoryForReconnection,
	type MockContainerRuntimeForReconnection,
	MockSharedObjectServices,
	MockStorage,
} from "@fluidframework/test-runtime-utils";
import { AttachState } from "@fluidframework/container-definitions";
import { type ISharedCounter, SharedCounter } from "../index.js";
import { CounterFactory } from "../counterFactory.js";

class TestSharedCounter extends SharedCounter {
	public testApplyStashedOp(content: unknown): void {
		this.applyStashedOp(content);
	}
}

describe("SharedCounter", () => {
	let testCounter: ISharedCounter;
	let dataStoreRuntime: MockFluidDataStoreRuntime;
	let factory: IChannelFactory;

	beforeEach("createTestCounter", async () => {
		dataStoreRuntime = new MockFluidDataStoreRuntime();
		factory = SharedCounter.getFactory();
		testCounter = factory.create(dataStoreRuntime, "counter") as ISharedCounter;
	});

	describe("SharedCounter in local state", () => {
		describe("constructor", () => {
			it("Can create a counter with default value", () => {
				assert.ok(testCounter, "Count not create the SharedCounter");
				assert.equal(testCounter.value, 0, "The default value is incorrect");
			});
		});

		describe("increment", () => {
			it("Can increment a counter with positive and negative values", () => {
				testCounter.increment(20);
				assert.equal(testCounter.value, 20, "Could not increment with positive value");
				testCounter.increment(-30);
				assert.equal(testCounter.value, -10, "Could not increment with negative value");
			});

			it("Fires a listener callback after increment", () => {
				let fired1 = false;
				let fired2 = false;

				testCounter.on("incremented", (incrementAmount: number, newValue: number) => {
					if (!fired1) {
						fired1 = true;
						assert.equal(
							incrementAmount,
							10,
							"The increment amount in the first event is incorrect",
						);
						assert.equal(newValue, 10, "The new value in the first event is incorrect");
					} else if (fired2) {
						assert.fail("incremented event fired too many times");
					} else {
						fired2 = true;
						assert.equal(
							incrementAmount,
							-3,
							"The increment amount in the second event is incorrect",
						);
						assert.equal(newValue, 7, "The new value in the second event is incorrect");
					}
				});

				testCounter.increment(10);
				testCounter.increment(-3);
				assert.ok(fired1, "The event for first increment was not fired");
				assert.ok(fired2, "The event for second increment was not fired");
			});
		});

		describe("applyStashedOp", () => {
			it("Immediately applies the op's increment locally", () => {
				const amt = 7;
				const dataStoreRuntime1 = new MockFluidDataStoreRuntime();
				const op = { type: "increment", incrementAmount: amt };
				const counter1 = new TestSharedCounter(
					"testCounter1",
					dataStoreRuntime1,
					CounterFactory.Attributes,
				);
				counter1.testApplyStashedOp(op);
				assert.equal(counter1.value, amt);
			});
		});

		describe("snapshot / load", () => {
			it("can load a SharedCounter from snapshot", async () => {
				testCounter.increment(20);
				testCounter.increment(-10);

				// Load a new SharedCounter from the snapshot of the first one.
				const services = MockSharedObjectServices.createFromSummary(
					testCounter.getAttachSummary().summary,
				);
				const testCounter2 = factory.create(dataStoreRuntime, "counter2") as SharedCounter;
				await testCounter2.load(services);

				// Verify that the new SharedCounter has the correct value.
				assert.equal(
					testCounter.value,
					10,
					"The loaded SharedCounter does not have the correct value",
				);
			});
		});
	});

	describe("SharedCounter in connected state with a remote SharedCounter", () => {
		let testCounter2: ISharedCounter;
		let containerRuntimeFactory: MockContainerRuntimeFactory;

		beforeEach("createTestCounters", () => {
			containerRuntimeFactory = new MockContainerRuntimeFactory();

			// Connect the first SharedCounter.
			dataStoreRuntime.setAttachState(AttachState.Attached);

			containerRuntimeFactory.createContainerRuntime(dataStoreRuntime);
			const services1 = {
				deltaConnection: dataStoreRuntime.createDeltaConnection(),
				objectStorage: new MockStorage(),
			};
			testCounter.connect(services1);

			// Create and connect a second SharedCounter.
			const dataStoreRuntime2 = new MockFluidDataStoreRuntime();

			containerRuntimeFactory.createContainerRuntime(dataStoreRuntime2);
			const services2 = {
				deltaConnection: dataStoreRuntime2.createDeltaConnection(),
				objectStorage: new MockStorage(),
			};

			testCounter2 = factory.create(dataStoreRuntime, "counter2") as SharedCounter;
			testCounter2.connect(services2);
		});

		describe("increment", () => {
			it("Can increment a counter with positive and negative values", () => {
				testCounter.increment(20);

				containerRuntimeFactory.processAllMessages();

				assert.equal(testCounter.value, 20, "Could not increment with positive value");
				assert.equal(testCounter2.value, 20, "Could not increment with positive value");

				testCounter.increment(-30);

				containerRuntimeFactory.processAllMessages();

				assert.equal(testCounter.value, -10, "Could not increment with negative value");
				assert.equal(testCounter2.value, -10, "Could not increment with negative value");
			});

			it("Fires a listener callback after increment", () => {
				let fired1 = false;
				let fired2 = false;

				testCounter2.on("incremented", (incrementAmount: number, newValue: number) => {
					if (!fired1) {
						fired1 = true;
						assert.equal(
							incrementAmount,
							10,
							"The increment amount in the first event is incorrect",
						);
						assert.equal(newValue, 10, "The new value in the first event is incorrect");
					} else if (fired2) {
						assert.fail("incremented event fired too many times");
					} else {
						fired2 = true;
						assert.equal(
							incrementAmount,
							-3,
							"The increment amount in the second event is incorrect",
						);
						assert.equal(newValue, 7, "The new value in the second event is incorrect");
					}
				});

				testCounter.increment(10);
				testCounter.increment(-3);

				containerRuntimeFactory.processAllMessages();

				assert.ok(fired1, "The event for first increment was not fired");
				assert.ok(fired2, "The event for second increment was not fired");
			});
		});
	});

	describe("SharedCounter reconnection flow", () => {
		let containerRuntimeFactory: MockContainerRuntimeFactoryForReconnection;
		let containerRuntime1: MockContainerRuntimeForReconnection;
		let containerRuntime2: MockContainerRuntimeForReconnection;
		let testCounter2: ISharedCounter;

		beforeEach("createTestCounters", () => {
			containerRuntimeFactory = new MockContainerRuntimeFactoryForReconnection();

			// Connect the first SharedCounter.
			dataStoreRuntime.setAttachState(AttachState.Attached);
			containerRuntime1 = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime);
			const services1 = {
				deltaConnection: dataStoreRuntime.createDeltaConnection(),
				objectStorage: new MockStorage(),
			};
			testCounter.connect(services1);

			// Create and connect a second SharedCounter.
			const dataStoreRuntime2 = new MockFluidDataStoreRuntime();
			containerRuntime2 = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime2);
			const services2 = {
				deltaConnection: dataStoreRuntime2.createDeltaConnection(),
				objectStorage: new MockStorage(),
			};

			testCounter2 = factory.create(dataStoreRuntime, "counter2") as SharedCounter;
			testCounter2.connect(services2);
		});

		it("can resend unacked ops on reconnection", async () => {
			// Increment the first SharedCounter.
			testCounter.increment(20);

			// Disconnect and reconnect the first client.
			containerRuntime1.connected = false;
			containerRuntime1.connected = true;

			// Process the messages.
			containerRuntimeFactory.processAllMessages();

			// Verify that the value is incremented in both the clients.
			assert.equal(testCounter.value, 20, "Value not incremented in first client");
			assert.equal(testCounter2.value, 20, "Value not incremented in second client");

			// Increment the second SharedCounter.
			testCounter.increment(-40);

			// Disconnect and reconnect the second client.
			containerRuntime2.connected = false;
			containerRuntime2.connected = true;

			// Process the messages.
			containerRuntimeFactory.processAllMessages();

			// Verify that the value is incremented in both the clients.
			assert.equal(testCounter.value, -20, "Value not incremented in first client");
			assert.equal(testCounter2.value, -20, "Value not incremented in second client");
		});

		it("can store ops in disconnected state and resend them on reconnection", async () => {
			// Disconnect the first client.
			containerRuntime1.connected = false;

			// Increment the first SharedCounter.
			testCounter.increment(20);

			// Reconnect the first client.
			containerRuntime1.connected = true;

			// Process the messages.
			containerRuntimeFactory.processAllMessages();

			// Verify that the value is incremented in both the clients.
			assert.equal(testCounter.value, 20, "Value not incremented in first client");
			assert.equal(testCounter2.value, 20, "Value not incremented in second client");

			// Disconnect the second client.
			containerRuntime2.connected = false;

			// Increment the second SharedCounter.
			testCounter.increment(-40);

			// Reconnect the second client.
			containerRuntime2.connected = true;

			// Process the messages.
			containerRuntimeFactory.processAllMessages();

			// Verify that the value is incremented in both the clients.
			assert.equal(testCounter.value, -20, "Value not incremented in first client");
			assert.equal(testCounter2.value, -20, "Value not incremented in second client");
		});
	});
});
