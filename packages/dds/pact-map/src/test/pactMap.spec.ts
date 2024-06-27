/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	MockContainerRuntimeFactory,
	MockContainerRuntimeFactoryForReconnection,
	type MockContainerRuntimeForReconnection,
	MockFluidDataStoreRuntime,
	MockStorage,
} from "@fluidframework/test-runtime-utils/internal";

import type { IPactMap } from "../interfaces.js";
import { PactMapClass } from "../pactMap.js";
import { PactMapFactory } from "../pactMapFactory.js";

function createConnectedPactMap(
	id: string,
	runtimeFactory: MockContainerRuntimeFactory,
): PactMapClass {
	// Create and connect a PactMap.
	const dataStoreRuntime = new MockFluidDataStoreRuntime();
	runtimeFactory.createContainerRuntime(dataStoreRuntime);
	const services = {
		deltaConnection: dataStoreRuntime.createDeltaConnection(),
		objectStorage: new MockStorage(),
	};

	const pactMap = new PactMapClass(id, dataStoreRuntime, PactMapFactory.Attributes);
	pactMap.connect(services);
	return pactMap;
}

const createLocalPactMap = (id: string): PactMapClass =>
	new PactMapClass(id, new MockFluidDataStoreRuntime(), PactMapFactory.Attributes);

describe("PactMap", () => {
	describe("Local state", () => {
		let pactMap: PactMapClass;

		beforeEach(() => {
			pactMap = createLocalPactMap("pactMap");
		});

		describe("APIs", () => {
			it("Can create a PactMap", () => {
				assert.ok(pactMap, "Could not create a PactMap");
			});
		});
	});

	describe("Connected state, single client", () => {
		let pactMap: IPactMap;
		let containerRuntimeFactory: MockContainerRuntimeFactory;

		beforeEach(() => {
			containerRuntimeFactory = new MockContainerRuntimeFactory();
			pactMap = createConnectedPactMap("pactMap", containerRuntimeFactory);
		});

		it("Can create the PactMap", async () => {
			assert.ok(pactMap, "Could not create PactMap");
		});

		it("Can set a value and read it from all clients", async () => {
			const expectedKey = "key";
			const expectedValue = "value";
			const pactMapAcceptanceP = new Promise<void>((resolve) => {
				const watchForPending = (pendingKey: string): void => {
					if (pendingKey === expectedKey) {
						assert.strictEqual(
							pactMap.getPending(expectedKey),
							expectedValue,
							"Value in PactMap should be pending now",
						);
						assert.strictEqual(
							pactMap.get(expectedKey),
							undefined,
							"Value in PactMap should not be accepted yet",
						);
						pactMap.off("pending", watchForPending);

						// Doing this synchronously after validating pending, since processAllMessages() won't permit
						// us to pause after the set but before the noop.
						const watchForAccepted = (acceptedKey: string): void => {
							if (acceptedKey === expectedKey) {
								assert.strictEqual(
									pactMap.getPending(expectedKey),
									undefined,
									"Value in PactMap should not be pending anymore",
								);
								assert.strictEqual(
									pactMap.get(expectedKey),
									expectedValue,
									"Value in PactMap should be accepted now",
								);
								pactMap.off("accepted", watchForAccepted);
								resolve();
							}
						};
						pactMap.on("accepted", watchForAccepted);
					}
				};
				pactMap.on("pending", watchForPending);
			});
			pactMap.set(expectedKey, expectedValue);
			containerRuntimeFactory.processAllMessages();

			await pactMapAcceptanceP;
			assert.strictEqual(pactMap.get(expectedKey), expectedValue, "Wrong value in PactMap");
		});
	});

	describe("Connected state, multiple clients", () => {
		let pactMap1: IPactMap;
		let pactMap2: IPactMap;
		let containerRuntimeFactory: MockContainerRuntimeFactory;

		beforeEach(() => {
			containerRuntimeFactory = new MockContainerRuntimeFactory();
			pactMap1 = createConnectedPactMap("pactMap1", containerRuntimeFactory);
			pactMap2 = createConnectedPactMap("pactMap2", containerRuntimeFactory);
		});

		it("Can create the PactMaps", async () => {
			assert.ok(pactMap1, "Could not create pactMap1");
			assert.ok(pactMap2, "Could not create pactMap2");
		});

		it("Can set a value and read it from all clients", async () => {
			const expectedKey = "key";
			const expectedValue = "value";
			const pactMap1AcceptanceP = new Promise<void>((resolve) => {
				const watchForPending = (pendingKey: string): void => {
					if (pendingKey === expectedKey) {
						assert.strictEqual(
							pactMap1.getPending(expectedKey),
							expectedValue,
							"Value in PactMap 1 should be pending now",
						);
						assert.strictEqual(
							pactMap1.get(expectedKey),
							undefined,
							"Value in PactMap 1 should not be accepted yet",
						);
						pactMap1.off("pending", watchForPending);

						// Doing this synchronously after validating pending, since processAllMessages() won't permit
						// us to pause after the set but before the noop.
						const watchForAccepted = (acceptedKey: string): void => {
							if (acceptedKey === expectedKey) {
								assert.strictEqual(
									pactMap1.getPending(expectedKey),
									undefined,
									"Value in PactMap 1 should not be pending anymore",
								);
								assert.strictEqual(
									pactMap1.get(expectedKey),
									expectedValue,
									"Value in PactMap 1 should be accepted now",
								);
								pactMap1.off("accepted", watchForAccepted);
								resolve();
							}
						};
						pactMap1.on("accepted", watchForAccepted);
					}
				};
				pactMap1.on("pending", watchForPending);
			});
			const pactMap2AcceptanceP = new Promise<void>((resolve) => {
				const watchForPending = (pendingKey: string): void => {
					if (pendingKey === expectedKey) {
						assert.strictEqual(
							pactMap2.getPending(expectedKey),
							expectedValue,
							"Value in PactMap 2 should be pending now",
						);
						assert.strictEqual(
							pactMap2.get(expectedKey),
							undefined,
							"Value in PactMap 2 should not be accepted yet",
						);
						pactMap2.off("pending", watchForPending);

						// Doing this synchronously after validating pending, since processAllMessages() won't permit
						// us to pause after the set but before the noop.
						const watchForAccepted = (acceptedKey: string): void => {
							if (acceptedKey === expectedKey) {
								assert.strictEqual(
									pactMap2.getPending(expectedKey),
									undefined,
									"Value in PactMap 2 should not be pending anymore",
								);
								assert.strictEqual(
									pactMap2.get(expectedKey),
									expectedValue,
									"Value in PactMap 2 should be accepted now",
								);
								pactMap2.off("accepted", watchForAccepted);
								resolve();
							}
						};
						pactMap2.on("accepted", watchForAccepted);
					}
				};
				pactMap2.on("pending", watchForPending);
			});
			pactMap1.set(expectedKey, expectedValue);
			containerRuntimeFactory.processAllMessages();

			await Promise.all([pactMap1AcceptanceP, pactMap2AcceptanceP]);
			assert.strictEqual(pactMap1.get(expectedKey), expectedValue, "Wrong value in PactMap 1");
			assert.strictEqual(pactMap2.get(expectedKey), expectedValue, "Wrong value in PactMap 2");
		});

		it("Resolves simultaneous sets and deletes with first-write-wins", async () => {
			const targetKey = "key";
			pactMap1.set(targetKey, "expected");
			pactMap2.set(targetKey, "unexpected1");
			containerRuntimeFactory.processAllMessages();

			assert.strictEqual(pactMap1.get(targetKey), "expected", "Unexpected value in pactMap1");
			assert.strictEqual(pactMap2.get(targetKey), "expected", "Unexpected value in pactMap2");

			pactMap2.delete(targetKey);
			pactMap1.set(targetKey, "unexpected2");
			containerRuntimeFactory.processAllMessages();

			assert.strictEqual(pactMap1.get(targetKey), undefined, "Unexpected value in pactMap1");
			assert.strictEqual(pactMap2.get(targetKey), undefined, "Unexpected value in pactMap2");
		});
	});

	describe("Detached/Attach", () => {
		let containerRuntimeFactory: MockContainerRuntimeFactory;

		beforeEach(() => {
			containerRuntimeFactory = new MockContainerRuntimeFactory();
		});

		it("Can set and delete values before attaching and functions normally after attaching", async () => {
			// Create a detached PactMap.
			const dataStoreRuntime = new MockFluidDataStoreRuntime();
			containerRuntimeFactory.createContainerRuntime(dataStoreRuntime);

			const pactMap = new PactMapClass("pactMap", dataStoreRuntime, PactMapFactory.Attributes);
			assert.strict(!pactMap.isAttached(), "PactMap is attached earlier than expected");

			const accept1P = new Promise<void>((resolve) => {
				pactMap.on("accepted", (key) => {
					if (key === "baz") {
						resolve();
					}
				});
			});
			pactMap.set("foo", "bar");
			pactMap.set("baz", "boop");
			await accept1P;
			assert.strictEqual(pactMap.get("baz"), "boop", "Couldn't set value in detached state");

			const accept2P = new Promise<void>((resolve) => {
				pactMap.on("accepted", (key) => {
					if (key === "foo") {
						resolve();
					}
				});
			});
			pactMap.delete("foo");
			await accept2P;
			assert.strictEqual(
				pactMap.get("foo"),
				undefined,
				"Couldn't delete value in detached state",
			);

			// Attach the PactMap
			const services = {
				deltaConnection: dataStoreRuntime.createDeltaConnection(),
				objectStorage: new MockStorage(),
			};
			pactMap.connect(services);

			assert.strict(pactMap.isAttached(), "PactMap is not attached when expected");
			assert.strictEqual(pactMap.get("foo"), undefined, "Wrong value in foo after attach");
			assert.strictEqual(pactMap.get("baz"), "boop", "Wrong value in baz after attach");

			const accept3P = new Promise<void>((resolve) => {
				pactMap.on("accepted", (key) => {
					if (key === "woz") {
						resolve();
					}
				});
			});
			pactMap.set("woz", "wiz");
			containerRuntimeFactory.processAllMessages();
			await accept3P;
			assert.strictEqual(
				pactMap.get("woz"),
				"wiz",
				"Wrong value in woz after post-attach set",
			);
		});
	});

	describe("Disconnect/Reconnect", () => {
		let containerRuntimeFactory: MockContainerRuntimeFactoryForReconnection;
		let containerRuntime1: MockContainerRuntimeForReconnection;
		let containerRuntime2: MockContainerRuntimeForReconnection;
		let pactMap1: PactMapClass;
		let pactMap2: PactMapClass;

		beforeEach(async () => {
			containerRuntimeFactory = new MockContainerRuntimeFactoryForReconnection();

			// Create the first PactMap.
			const dataStoreRuntime1 = new MockFluidDataStoreRuntime();
			containerRuntime1 = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime1);
			const services1 = {
				deltaConnection: dataStoreRuntime1.createDeltaConnection(),
				objectStorage: new MockStorage(),
			};
			pactMap1 = new PactMapClass("pact-map-1", dataStoreRuntime1, PactMapFactory.Attributes);
			pactMap1.connect(services1);

			// Create the second PactMap.
			const dataStoreRuntime2 = new MockFluidDataStoreRuntime();
			containerRuntime2 = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime2);
			const services2 = {
				deltaConnection: dataStoreRuntime2.createDeltaConnection(),
				objectStorage: new MockStorage(),
			};
			pactMap2 = new PactMapClass("pact-map-2", dataStoreRuntime2, PactMapFactory.Attributes);
			pactMap2.connect(services2);
		});

		it("Doesn't resubmit accept ops that were sent before offline", async () => {
			const targetKey = "key";
			pactMap1.set(targetKey, "expected");
			// This should cause pactMap2 to produce an accept op but...
			containerRuntimeFactory.processSomeMessages(1); // pactMap1 "set"
			// We disconnect before it gets processed.
			containerRuntime2.connected = false;
			containerRuntime2.connected = true;
			// Processing an unexpected accept will error and fail the test
			containerRuntimeFactory.processAllMessages();
		});

		it("Doesn't resubmit unsequenced proposals that were sent before offline but are futile after reconnect", async () => {
			const targetKey = "key";
			pactMap1.set(targetKey, "unexpected");
			containerRuntime1.connected = false;
			containerRuntimeFactory.processAllMessages();
			pactMap2.set(targetKey, "expected");
			containerRuntimeFactory.processAllMessages();
			assert.strictEqual(
				pactMap2.get(targetKey),
				"expected",
				"PactMap2 should see the expected value",
			);
			assert.strictEqual(
				pactMap1.get(targetKey),
				undefined,
				"PactMap1 should not see any value",
			);
			containerRuntime1.connected = true;
			assert.strictEqual(
				containerRuntimeFactory.outstandingMessageCount,
				0,
				"Should not have generated an op",
			);
			containerRuntimeFactory.processAllMessages();
			assert.strictEqual(
				pactMap1.get(targetKey),
				"expected",
				"PactMap1 should see the expected value",
			);
		});

		it("Unsequenced proposals sent before offline and still valid after reconnect are accepted after reconnect", async () => {
			const targetKey = "key";
			pactMap1.set(targetKey, "expected");
			containerRuntime1.connected = false;
			containerRuntime1.connected = true;
			containerRuntimeFactory.processAllMessages();
			assert.strictEqual(
				pactMap1.get(targetKey),
				"expected",
				"PactMap1 should see the expected value",
			);
			assert.strictEqual(
				pactMap2.get(targetKey),
				"expected",
				"PactMap2 should see the expected value",
			);
		});

		it("Doesn't resubmit unsequenced proposals that were sent during offline but are futile after reconnect", async () => {
			const targetKey = "key";
			containerRuntime1.connected = false;
			pactMap1.set(targetKey, "unexpected");
			containerRuntimeFactory.processAllMessages();
			pactMap2.set(targetKey, "expected");
			containerRuntimeFactory.processAllMessages();
			assert.strictEqual(
				pactMap2.get(targetKey),
				"expected",
				"PactMap2 should see the expected value",
			);
			assert.strictEqual(
				pactMap1.get(targetKey),
				undefined,
				"PactMap1 should not see any value",
			);
			containerRuntime1.connected = true;
			assert.strictEqual(
				containerRuntimeFactory.outstandingMessageCount,
				0,
				"Should not have generated an op",
			);
			assert.strictEqual(
				pactMap1.get(targetKey),
				"expected",
				"PactMap1 should see the expected value",
			);
		});

		it("Unsequenced proposals sent during offline and still valid after reconnect are accepted after reconnect", async () => {
			const targetKey = "key";
			containerRuntime1.connected = false;
			pactMap1.set(targetKey, "expected");
			containerRuntime1.connected = true;
			containerRuntimeFactory.processAllMessages();
			assert.strictEqual(
				pactMap1.get(targetKey),
				"expected",
				"PactMap1 should see the expected value",
			);
			assert.strictEqual(
				pactMap2.get(targetKey),
				"expected",
				"PactMap2 should see the expected value",
			);
		});

		it("Sequenced proposals that were accepted during offline have correct state after reconnect", async () => {
			const targetKey = "key";
			pactMap1.set(targetKey, "expected");
			containerRuntimeFactory.processOneMessage(); // pactMap1 "set"
			containerRuntime1.connected = false;
			containerRuntimeFactory.processAllMessages(); // Process the accept from client 2
			containerRuntime1.connected = true;
			assert.strictEqual(
				containerRuntimeFactory.outstandingMessageCount,
				0,
				"Should not have generated an op",
			);
			assert.strictEqual(
				pactMap1.get(targetKey),
				"expected",
				"PactMap1 should see the expected value",
			);
			assert.strictEqual(
				pactMap2.get(targetKey),
				"expected",
				"PactMap2 should see the expected value",
			);
		});

		it("Sequenced proposals that remained pending during offline have correct state after reconnect", async () => {
			const targetKey = "key";
			pactMap1.set(targetKey, "expected");
			containerRuntimeFactory.processOneMessage(); // pactMap1 "set"
			containerRuntime1.connected = false;
			containerRuntime1.connected = true;
			assert.strictEqual(
				containerRuntimeFactory.outstandingMessageCount,
				1,
				"Should only have client 2 accept",
			);
			assert.strictEqual(
				pactMap1.get(targetKey),
				undefined,
				"PactMap1 should not see the expected value",
			);
			assert.strictEqual(
				pactMap2.get(targetKey),
				undefined,
				"PactMap2 should not see the expected value",
			);
			containerRuntimeFactory.processAllMessages();
			assert.strictEqual(
				pactMap1.get(targetKey),
				"expected",
				"PactMap1 should see the expected value",
			);
			assert.strictEqual(
				pactMap2.get(targetKey),
				"expected",
				"PactMap2 should see the expected value",
			);
		});
	});
});
