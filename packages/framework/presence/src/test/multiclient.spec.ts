/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { AttachState } from "@fluidframework/container-definitions";
// import { AzureClient, type AzureContainerServices } from "@fluidframework/azure-client";
import { ConnectionState } from "@fluidframework/container-loader";
// import type { ConfigTypes, IConfigProviderBase } from "@fluidframework/core-interfaces";
import type { ScopeType } from "@fluidframework/driver-definitions/internal";
import type { ContainerSchema, IFluidContainer } from "@fluidframework/fluid-static";
import { timeoutPromise } from "@fluidframework/test-utils/internal";
import type {
	TinyliciousClient,
	TinyliciousContainerServices,
	TinyliciousUser,
} from "@fluidframework/tinylicious-client";

import {
	ExperimentalPresenceManager,
	getPresenceViaDataObject,
	LatestClientData,
	StateFactory,
	type Attendee,
	type AttendeeId,
	type ExperimentalPresenceDO,
	type Latest,
	type LatestMap,
	type LatestMapClientData,
	type LatestRaw,
	type Presence,
	type ProxiedValueAccessor,
	type StateSchemaValidator,
	type StatesWorkspace,
	type ValueAccessor,
	type WorkspaceAddress,
} from "../index.js";

import { createTinyliciousClient } from "./TinyliciousClientFactory.js";
import { type ValidatorSpy, createSpiedValidator, createNullValidator } from "./testUtils.js";
import type { Listenable, Off } from "@fluidframework/core-interfaces";
import type {
	DeepReadonly,
	JsonDeserialized,
	JsonSerializable,
} from "@fluidframework/core-interfaces/internal";

interface TestData {
	num: number;
}

interface TestMapData {
	key1: TestData;
	key2?: TestData;
}

const listeners: Off[] = [];

async function waitForAttendeeEvent(
	event: "attendeeDisconnected" | "attendeeConnected",
	...presences: Presence[]
): Promise<Attendee[]> {
	return Promise.all(
		presences.map(async (presence, index) =>
			timeoutPromise<Attendee>(
				(resolve) => {
					const off = presence.attendees.events.on(event, (attendee) => {
						off();
						resolve(attendee);
					});
					listeners.push(off);
				},
				{
					durationMs: 2000,
					errorMsg: `Attendee[${index}] Timeout`,
				},
			),
		),
	);
}

async function waitForRemoteUpdated<T>(
	latestData: Latest<T, ProxiedValueAccessor<T>>,
	tag = "",
) {
	await timeoutPromise<LatestClientData<T, ProxiedValueAccessor<T>>>(
		(resolve) =>
			latestData.events.on("remoteUpdated", (data) => {
				// console.log(`${tag}remoteUpdated: ${JSON.stringify(data, undefined, 2)}`);
				resolve(data);
			}),
		{
			durationMs: 2000,
			errorMsg: `${tag}remoteUpdated Timeout`,
		},
	);
}

async function waitForRemoteMapUpdated<T>(
	latestData: LatestMap<T, any, ProxiedValueAccessor<T>>,
	tag = "",
) {
	await timeoutPromise<LatestMapClientData<T, any, ProxiedValueAccessor<T>, AttendeeId>>(
		(resolve) =>
			latestData.events.on("remoteUpdated", (data) => {
				// console.log(`${tag}remoteUpdated: ${JSON.stringify(data, undefined, 2)}`);
				resolve(data);
			}),
		{
			durationMs: 2000,
			errorMsg: `${tag}remoteUpdated Timeout`,
		},
	);
}

async function waitForLocalUpdated<T>(
	latestData: Latest<T, ProxiedValueAccessor<T>>,
	tag = "",
) {
	await timeoutPromise<DeepReadonly<JsonSerializable<T> & JsonDeserialized<T>>>(
		(resolve) =>
			latestData.events.on("localUpdated", (data) => {
				// console.log(`${tag}localUpdated: ${JSON.stringify(data, undefined, 2)}`);
				resolve(data.value);
			}),
		{
			durationMs: 2000,
			errorMsg: `${tag}localUpdated Timeout`,
		},
	);
}

async function waitForWorkspaceActivated(presence: Presence): Promise<WorkspaceAddress> {
	const workspaceAddress = await timeoutPromise<WorkspaceAddress>(
		(resolve) =>
			presence.events.on("workspaceActivated", (data) => {
				// console.log(`workspaceActivated: ${JSON.stringify(data)}`);
				resolve(data);
			}),
		{
			durationMs: 2000,
			errorMsg: `workspaceActivated Timeout`,
		},
	);
	return workspaceAddress;
}

async function initTestWorkspaces(
	p1: Presence,
	p2: Presence,
): Promise<{
	client1: {
		attendee: Attendee;
		latest: {
			stateManager: Latest<TestData>;
			validatorFunction: StateSchemaValidator<TestData>;
			validatorSpy: ValidatorSpy;
		};
		latestMap: {
			stateManager: LatestMap<TestData>;
			validatorFunction: StateSchemaValidator<TestData>;
			validatorSpy: ValidatorSpy;
		};
	};
	client2: {
		attendee: Attendee;
		latest: {
			stateManager: Latest<TestData>;
			validatorFunction: StateSchemaValidator<TestData>;
			validatorSpy: ValidatorSpy;
		};
		latestMap: {
			stateManager: LatestMap<TestData>;
			validatorFunction: StateSchemaValidator<TestData>;
			validatorSpy: ValidatorSpy;
		};
	};
}> {
	const [validatorFunction1, validatorSpy1] = createSpiedValidator<TestData>(
		createNullValidator(),
	);
	const [validatorFunction2, validatorSpy2] = createSpiedValidator<TestData>(
		createNullValidator(),
	);

	const [mapValidatorFunction1, mapValidatorSpy1] = createSpiedValidator<TestData>(
		createNullValidator(),
	);
	const [mapValidatorFunction2, mapValidatorSpy2] = createSpiedValidator<TestData>(
		createNullValidator(),
	);

	// return {
	// 	// attendees: [p1.attendees.getMyself(), p2.attendees.getMyself()],
	// 	// workspaces: [stateWorkspace1, stateWorkspace2],
	// 	validatorFunctions: [validatorFunction1, validatorFunction2],
	// 	validatorSpies: [validatorSpy1, validatorSpy2],
	// };

	// Configure a state workspace on client 1
	const stateWorkspace1 = p1.states.getWorkspace("name:testStateWorkspace", {
		latestState: StateFactory.latest({
			local: { num: 0 } satisfies TestData,
			validator: validatorFunction1,
			settings: { allowableUpdateLatencyMs: 0 },
		}),
		latestMap: StateFactory.latestMap({
			local: { key1: { num: 3 }, key2: { num: 2 } } satisfies TestMapData,
			validator: validatorFunction2,
			settings: { allowableUpdateLatencyMs: 0 },
		}),
	});

	// Wait for client 2 to receive the workspaceActivated event
	const workspaceAddress = await waitForWorkspaceActivated(p2);

	// Client 2 now gets a reference to the workspace and sets its initial local data
	const stateWorkspace2 = p2.states.getWorkspace(workspaceAddress, {
		latestState: StateFactory.latest({
			local: { num: 0 } satisfies TestData,
			validator: validatorFunction1,
			settings: { allowableUpdateLatencyMs: 0 },
		}),
		latestMap: StateFactory.latestMap({
			local: { key1: { num: 3 }, key2: { num: 2 } } satisfies TestMapData,
			validator: validatorFunction2,
			settings: { allowableUpdateLatencyMs: 0 },
		}),
	});

	// Get references to the states
	const { latestState: latestState1, latestMap: latestMap1 } = stateWorkspace1.states;
	const { latestState: latestState2, latestMap: latestMap2 } = stateWorkspace2.states;

	// Wait for the first client to receive the remote data from client 2's workspace init
	await waitForRemoteUpdated(latestState1);

	return {
		client1: {
			attendee: p1.attendees.getMyself(),
			latest: {
				stateManager: latestState1,
				validatorFunction: validatorFunction1,
				validatorSpy: validatorSpy1,
			},
			latestMap: {
				stateManager: latestMap1,
				validatorFunction: mapValidatorFunction1,
				validatorSpy: mapValidatorSpy1,
			},
		},
		client2: {
			attendee: p1.attendees.getMyself(),
			latest: {
				stateManager: latestState2,
				validatorFunction: validatorFunction2,
				validatorSpy: validatorSpy2,
			},
			latestMap: {
				stateManager: latestMap2,
				validatorFunction: mapValidatorFunction2,
				validatorSpy: mapValidatorSpy2,
			},
		},
	};
}

describe(`Presence with TinyliciousClient`, () => {
	const connectedContainers: IFluidContainer[] = [];
	const connectTimeoutMs = 10000;
	const user1: TinyliciousUser = {
		id: "test-user-id-1",
		name: "test-user-name-1",
	};
	const user2: TinyliciousUser = {
		id: "test-user-id-2",
		name: "test-user-name-2",
	};
	const user3: TinyliciousUser = {
		id: "test-user-id-3",
		name: "test-user-name-3",
	};

	let presence1: Presence;
	let presence2: Presence;
	let presence3: Presence;

	afterEach(() => {
		for (const container of connectedContainers) {
			container.disconnect();
			container.dispose();
		}
		connectedContainers.splice(0, connectedContainers.length);
	});

	const getOrCreatePresenceContainer = async (
		id: string | undefined,
		user: TinyliciousUser,
		scopes?: ScopeType[],
	): Promise<{
		container: IFluidContainer;
		presence: Presence;
		services: TinyliciousContainerServices;
		client: TinyliciousClient;
		containerId: string;
	}> => {
		const client = createTinyliciousClient(user.id, user.name, scopes);
		const schema: ContainerSchema = {
			initialObjects: {
				presence: ExperimentalPresenceManager,
			},
		};
		let container: IFluidContainer;
		let services: TinyliciousContainerServices;
		let containerId: string;
		if (id === undefined) {
			({ container, services } = await client.createContainer(schema, "2"));
			containerId = await container.attach();
		} else {
			containerId = id;
			({ container, services } = await client.getContainer(containerId, schema, "2"));
		}

		if (container.connectionState !== ConnectionState.Connected) {
			await timeoutPromise((resolve) => container.once("connected", () => resolve()), {
				durationMs: connectTimeoutMs,
				errorMsg: "container connect() timeout",
			});
		}
		connectedContainers.push(container);

		assert.strictEqual(typeof containerId, "string", "Attach did not return a string ID");
		assert.strictEqual(
			container.attachState,
			AttachState.Attached,
			"Container is not attached after attach is called",
		);

		const presence = getPresenceViaDataObject(
			container.initialObjects.presence as ExperimentalPresenceDO,
		);
		return {
			client,
			container,
			presence,
			services,
			containerId,
		};
	};

	const initMultiClientSetup = async () => {
		const res = await getOrCreatePresenceContainer(undefined, user1);
		presence1 = res.presence;

		const res2 = await getOrCreatePresenceContainer(res.containerId, user2);
		presence2 = res2.presence;

		const res3 = await getOrCreatePresenceContainer(res.containerId, user3);
		presence3 = res3.presence;

		assert.notEqual(presence1, undefined);
		assert.notEqual(presence2, undefined);
		assert.notEqual(presence3, undefined);

		const returnedAttendees = await waitForAttendeeEvent(
			"attendeeConnected",
			presence1,
			presence2,
			presence3,
		);

		assert.equal(returnedAttendees.length, 3);
	};

	describe("multiclient presence data validation", () => {
		it("getOrCreatePresenceContainer creates and returns initialized containers", async () => {
			await initMultiClientSetup();
		});

		describe("LatestValueManager", () => {
			// let validatorFunction1: StateSchemaValidator<TestData>;
			// let validatorFunction2: StateSchemaValidator<TestData>;
			// let validatorFunction3: StateSchemaValidator<TestData>;
			// let validatorSpy1: ValidatorSpy;
			// let validatorSpy2: ValidatorSpy;
			// let validatorSpy3: ValidatorSpy;

			// beforeEach(() => {
			// 	[validatorFunction1, validatorSpy1] = createSpiedValidator<TestData>(
			// 		createNullValidator(),
			// 	);
			// 	[validatorFunction2, validatorSpy2] = createSpiedValidator<TestData>(
			// 		createNullValidator(),
			// 	);
			// 	[validatorFunction3, validatorSpy3] = createSpiedValidator<TestData>(
			// 		createNullValidator(),
			// 	);
			// });

			describe("with shared test setup", () => {
				beforeEach(async () => {
					await initMultiClientSetup();
				});

				afterEach(() => {
					for (const container of connectedContainers) {
						container.disconnect();
						container.dispose();
					}
					connectedContainers.splice(0, connectedContainers.length);
				});

				it("invalidates data on update", async () => {
					const { client1, client2 } = await initTestWorkspaces(presence1, presence2);

					// Act & Verify
					let remoteData = client1.latest.stateManager.getRemote(client2.attendee);

					// Reading the data should cause the validator to get called once.
					assert.equal(remoteData.value()?.num, 0, "First value read failed");
					assert.equal(client1.latest.validatorSpy.callCount, 1);

					// Client 2 sets a value
					client2.latest.stateManager.local = { num: 22 };
					// Wait for the first client to receive the remote data from client 2
					await waitForRemoteUpdated(client1.latest.stateManager);
					remoteData = client1.latest.stateManager.getRemote(client2.attendee);
					assert.equal(remoteData.value()?.num, 22, "Second value read failed");

					client2.latest.stateManager.local = { num: 33 };
					// Wait for the first client to receive the remote data from client 2
					await waitForRemoteUpdated(client1.latest.stateManager);

					// Validator will be called again because the value changed.
					assert.equal(remoteData.value()?.num, 33, "Third value read failed");
					assert.equal(client1.latest.validatorSpy.callCount, 3);
				});

				it("two clients with workspaces", async () => {
					const { client1, client2 } = await initTestWorkspaces(presence1, presence2);

					// Reading the remote value should cause the validator to be called
					let value = client1.latest.stateManager.getRemote(client2.attendee).value();
					assert.equal(value?.num, 1, "getRemote(attendee2) count is wrong");
					assert.equal(client1.latest.validatorSpy.callCount, 1);

					// Reading the value a second time should not cause the validator to be called again
					value = client1.latest.stateManager.getRemote(client2.attendee).value();
					assert.equal(value?.num, 1, "second getRemote(attendee2) count is wrong");
					assert.equal(client1.latest.validatorSpy.callCount, 1);

					// Client 2 sets a new local value
					client2.latest.stateManager.local = { num: 22 };
					assert.equal(
						client2.latest.stateManager.local.num,
						22,
						"count2.local count is wrong",
					);

					// Wait for the remote data to get to client 1
					await waitForRemoteUpdated(client1.latest.stateManager, "TAGGED: ");

					// Reading the remote value should cause the validator to be called a second time since the data has been
					// changed.
					value = client1.latest.stateManager.getRemote(client2.attendee).value();
					assert.equal(value?.num, 22, "third getRemote(attendee2) count is wrong");
					assert.equal(client1.latest.validatorSpy.callCount, 2);

					// Second client should see the initial value for client 1
					value = client2.latest.stateManager.getRemote(client1.attendee).value();
					assert.equal(value?.num, 0, "getRemote(attendee1) count is wrong");

					// Second client should have called the validator once for the read above
					assert.equal(client2.latest.validatorSpy.callCount, 1);
				});
			});
		});

		describe("LatestMapValueManager", () => {
			let validatorFunction1: StateSchemaValidator<TestData>;
			let validatorFunction2: StateSchemaValidator<TestData>;
			let validatorFunction3: StateSchemaValidator<TestData>;
			let validatorSpy1: ValidatorSpy;
			let validatorSpy2: ValidatorSpy;
			let validatorSpy3: ValidatorSpy;

			beforeEach(() => {
				[validatorFunction1, validatorSpy1] = createSpiedValidator<TestData>(
					createNullValidator(),
				);
				[validatorFunction2, validatorSpy2] = createSpiedValidator<TestData>(
					createNullValidator(),
				);
				[validatorFunction3, validatorSpy3] = createSpiedValidator<TestData>(
					createNullValidator(),
				);
			});

			it("two clients with workspaces", async () => {
				await initMultiClientSetup();

				const [attendee1, attendee2] = [
					presence1.attendees.getMyself(),
					presence2.attendees.getMyself(),
				];

				// Configure a state workspace on client 1
				const stateWorkspace1 = presence1.states.getWorkspace("name:testStateWorkspace", {
					count: StateFactory.latestMap({
						local: { key1: { num: 0 }, key2: { num: 0 } } satisfies TestMapData,
						validator: validatorFunction1,
						settings: { allowableUpdateLatencyMs: 0 },
					}),
				});

				// Wait for client 2 to receive the workspaceActivated event
				const workspaceAddress = await waitForWorkspaceActivated(presence2);

				// Client 2 now gets a reference to the workspace and sets its initial local data
				const stateWorkspace2 = presence2.states.getWorkspace(workspaceAddress, {
					count: StateFactory.latestMap({
						local: { key1: { num: 3 }, key2: { num: 2 } } satisfies TestMapData,
						validator: validatorFunction2,
						settings: { allowableUpdateLatencyMs: 0 },
					}),
				});

				// Get references to the states
				const { count: client1 } = stateWorkspace1.states;
				const { count: client2 } = stateWorkspace2.states;

				// Wait for the first client to receive the remote data from client 2's workspace init
				await waitForRemoteMapUpdated(client1);

				// Reading the remote value should cause the validator to be called
				let remoteData = client1.getRemote(attendee2);
				let key1 = remoteData.get("key1")?.value();
				assert.equal(key1?.num, 3, "getRemote(attendee2) count is wrong");
				assert.equal(validatorSpy1.callCount, 1);

				// Reading the value a second time should not cause the validator to be called again
				remoteData = client1.getRemote(attendee2);
				key1 = remoteData.get("key1")?.value();
				assert.equal(key1?.num, 3, "second getRemote(attendee2) count is wrong");
				assert.equal(validatorSpy1.callCount, 1);

				// Reading a second key should cause the validator to be called again
				let key2 = remoteData.get("key2")?.value();
				assert.equal(key2?.num, 2, "third getRemote(attendee2) count is wrong");
				assert.equal(validatorSpy1.callCount, 2);

				// Client 2 sets a new local value for a key
				client2.local.set("key1", { num: 22 });
				const localValue = client2.local.get("key1");
				// Reading the local value should not call the validator
				assert.equal(
					validatorSpy2.callCount,
					0,
					"client2 validator should not have been called",
				);
				assert.equal(localValue?.num, 22, "count2.local count is wrong");

				// Wait for the remote data to get to client 1
				await waitForRemoteMapUpdated(client1, "TAGGED: ");

				// Reading the remote value should cause the validator to be called again since the data has been changed.
				remoteData = client1.getRemote(attendee2);
				key1 = remoteData.get("key1")?.value();
				assert.equal(key1?.num, 22, "third getRemote(attendee2) count is wrong");
				assert.equal(
					validatorSpy1.callCount,
					3,
					"client1 validator was called the wrong number of times",
				);

				// Second client should see the initial value for client 1
				remoteData = client2.getRemote(attendee1);
				key1 = remoteData.get("key1")?.value();
				assert.equal(key1?.num, 0, "getRemote(attendee1) count is wrong");
				assert.equal(
					validatorSpy2.callCount,
					1,
					"client2 validator was called the wrong number of times",
				);
				key2 = remoteData.get("key2")?.value();
				assert.equal(key2?.num, 0, "getRemote(attendee1) count is wrong");
				assert.equal(
					validatorSpy2.callCount,
					2,
					"client2 validator was called the wrong number of times",
				);
			});
		});
	});
});
