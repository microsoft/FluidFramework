/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { AttachState } from "@fluidframework/container-definitions";
// import { AzureClient, type AzureContainerServices } from "@fluidframework/azure-client";
import { ConnectionState } from "@fluidframework/container-loader";
// import type { ConfigTypes, IConfigProviderBase } from "@fluidframework/core-interfaces";
import type { Off } from "@fluidframework/core-interfaces";
import type {
	DeepReadonly,
	JsonDeserialized,
	JsonSerializable,
} from "@fluidframework/core-interfaces/internal";
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
	type ExperimentalPresenceDO,
} from "../datastorePresenceManagerFactory.js";
import type { InternalTypes } from "../exposedInternalTypes.js";
import type { LatestMap, LatestMapClientData } from "../latestMapValueManager.js";
import type { Latest } from "../latestValueManager.js";
import type {
	LatestClientData,
	LatestData,
	ProxiedValueAccessor,
	StateSchemaValidator,
} from "../latestValueTypes.js";
import type { Attendee, Presence } from "../presence.js";
import { StateFactory } from "../stateFactory.js";
import type { StatesWorkspace, WorkspaceAddress } from "../types.js";

import { createTinyliciousClient } from "./TinyliciousClientFactory.js";
import { type ValidatorSpy, createSpiedValidator, createNullValidator } from "./testUtils.js";

interface TestData {
	num: number;
}

interface TestMapData {
	key1: TestData;
	key2?: TestData;
}

const listeners: Off[] = [];

/**
 * Used as a namespace for functions that wait for client events.
 */
const event = {
	async AttendeeEvent(
		evt: "attendeeDisconnected" | "attendeeConnected",
		...presences: Presence[]
	): Promise<Attendee[]> {
		return Promise.all(
			presences.map(async (presence, index) =>
				timeoutPromise<Attendee>(
					(resolve) => {
						const off = presence.attendees.events.on(evt, (attendee) => {
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
	},
	async RemoteUpdated<T>(latestData: Latest<T>, tag = ""): Promise<void> {
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
	},
	async RemoteMapUpdated<T>(latestData: LatestMap<T, string>, tag = ""): Promise<void> {
		await timeoutPromise<LatestMapClientData<T, string, ProxiedValueAccessor<T>>>(
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
	},
	async LocalUpdated<T>(latestData: Latest<T>, tag = ""): Promise<void> {
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
	},
	async WorkspaceActivated(presence: Presence): Promise<WorkspaceAddress> {
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
	},
};

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

	let validatorFunction1: StateSchemaValidator<TestData>;
	let validatorFunction2: StateSchemaValidator<TestData>;
	let validatorFunction3: StateSchemaValidator<TestData>;

	let validatorSpy1: ValidatorSpy;
	let validatorSpy2: ValidatorSpy;
	let validatorSpy3: ValidatorSpy;

	let attendee1: Attendee;
	let attendee2: Attendee;

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

	const initMultiClientSetup = async (): Promise<void> => {
		const res = await getOrCreatePresenceContainer(undefined, user1);
		presence1 = res.presence;

		const res2 = await getOrCreatePresenceContainer(res.containerId, user2);
		presence2 = res2.presence;

		const res3 = await getOrCreatePresenceContainer(res.containerId, user3);
		presence3 = res3.presence;

		assert.notEqual(presence1, undefined);
		assert.notEqual(presence2, undefined);
		assert.notEqual(presence3, undefined);

		const returnedAttendees = await event.AttendeeEvent(
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

		describe("Latest", () => {
			let stateWorkspace1: StatesWorkspace<{
				testData: InternalTypes.ManagerFactory<
					string,
					InternalTypes.ValueRequiredState<{
						num: number;
					}>,
					Latest<{
						num: number;
					}>
				>;
			}>;

			let stateWorkspace2: StatesWorkspace<{
				testData: InternalTypes.ManagerFactory<
					string,
					InternalTypes.ValueRequiredState<{
						num: number;
					}>,
					Latest<{
						num: number;
					}>
				>;
			}>;

			let client1: Latest<TestData>;
			let client2: Latest<TestData>;

			beforeEach(async () => {
				await initMultiClientSetup();

				[attendee1, attendee2] = [
					presence1.attendees.getMyself(),
					presence2.attendees.getMyself(),
				];

				// Configure a state workspace on client 1
				stateWorkspace1 = presence1.states.getWorkspace("name:testStateWorkspace", {
					testData: StateFactory.latest({
						local: { num: 0 } satisfies TestData,
						validator: validatorFunction1,
						settings: { allowableUpdateLatencyMs: 0 },
					}),
				});

				// Wait for client 2 to receive the workspaceActivated event
				const workspaceAddress = await event.WorkspaceActivated(presence2);

				// Client 2 now gets a reference to the workspace and sets its initial local data
				stateWorkspace2 = presence2.states.getWorkspace(workspaceAddress, {
					testData: StateFactory.latest({
						local: { num: 1 } satisfies TestData,
						validator: validatorFunction2,
						settings: { allowableUpdateLatencyMs: 0 },
					}),
				});

				// Get references to the states
				client1 = stateWorkspace1.states.testData;
				client2 = stateWorkspace2.states.testData;

				// Wait for client 1 to receive client 2's initial data
				await event.RemoteUpdated(client1);
			});

			it("getRemote does not call validator", async () => {
				client1.getRemote(attendee2);
				assert.equal(validatorSpy1.callCount, 0);
			});

			it("calls validator on value read", async () => {
				const data = client1.getRemote(attendee2);
				// Reading the remote value should cause the validator to be called
				assert.equal(data?.value()?.num, 1);
				assert.equal(validatorSpy1.callCount, 1, "call count is wrong");
			});

			describe("remote data tests", () => {
				let data: LatestData<TestData, ProxiedValueAccessor<TestData>>;

				beforeEach(() => {
					data = client1.getRemote(attendee2);
				});

				it("calls validator only once if data is unchanged", async () => {
					// Reading the remote value should cause the validator to be called the first time,
					// but subsequent reads should not
					assert.equal(data?.value()?.num, 1);
					assert.equal(validatorSpy1.callCount, 1, "first call count is wrong");

					assert.equal(data?.value()?.num, 1);
					assert.equal(data?.value()?.num, 1);
					assert.equal(validatorSpy1.callCount, 1, "subsequent call count is wrong");
				});

				it("calls validator when remote data has changed", async () => {
					// Get the remote data and read it, verify that the validator is called once.
					data = client1.getRemote(attendee2);
					assert.equal(data?.value()?.num, 1);
					assert.equal(validatorSpy1.callCount, 1, "first call count is wrong");

					// Client 2 sets a new local value
					client2.local = { num: 22 };
					assert.equal(client2.local.num, 22, "client2.local value is wrong");

					// Wait for the remote data to get to client 1
					await event.RemoteUpdated(client1, "client1");

					// Reading the remote value should cause the validator to be called a second time since the data has been
					// changed.
					const data2 = client1.getRemote(attendee2);
					assert.equal(data2?.value()?.num, 22, "third getRemote(attendee2) count is wrong");
					assert.equal(validatorSpy1.callCount, 2);
				});

				it("client2 sees initial data from client1", async () => {
					// Second client should see the initial value for client 1
					data = client2.getRemote(attendee1);
					assert.equal(data?.value()?.num, 0);

					// Second client should have called the validator once for the read above
					assert.equal(validatorSpy2.callCount, 1);
				});
			});
		});

		describe("LatestMap", () => {
			let stateWorkspace1: StatesWorkspace<{
				testData: InternalTypes.ManagerFactory<
					string,
					InternalTypes.MapValueState<TestData, "key1" | "key2">,
					LatestMap<TestData, "key1" | "key2">
				>;
			}>;

			let stateWorkspace2: StatesWorkspace<{
				testData: InternalTypes.ManagerFactory<
					string,
					InternalTypes.MapValueState<TestData, "key1" | "key2">,
					LatestMap<TestData, "key1" | "key2">
				>;
			}>;

			let client1: LatestMap<TestData, string>;
			let client2: LatestMap<TestData, string>;

			beforeEach(async () => {
				await initMultiClientSetup();

				[attendee1, attendee2] = [
					presence1.attendees.getMyself(),
					presence2.attendees.getMyself(),
				];

				// Configure a state workspace on client 1
				stateWorkspace1 = presence1.states.getWorkspace("name:testStateWorkspace", {
					testData: StateFactory.latestMap({
						local: { key1: { num: 0 }, key2: { num: 0 } } satisfies TestMapData,
						validator: validatorFunction1,
						settings: { allowableUpdateLatencyMs: 0 },
					}),
				});

				// Wait for client 2 to receive the workspaceActivated event
				const workspaceAddress = await event.WorkspaceActivated(presence2);

				// Client 2 now gets a reference to the workspace and sets its initial local data
				stateWorkspace2 = presence2.states.getWorkspace(workspaceAddress, {
					testData: StateFactory.latestMap({
						local: { key1: { num: 3 }, key2: { num: 2 } } satisfies TestMapData,
						validator: validatorFunction2,
						settings: { allowableUpdateLatencyMs: 0 },
					}),
				});

				// Get references to the states
				client1 = stateWorkspace1.states.testData;
				client2 = stateWorkspace2.states.testData;

				// Wait for client 1 to receive client 2's initial data
				await event.RemoteMapUpdated(client1);
			});

			it("getRemote does not call validator", async () => {
				client1.getRemote(attendee2);
				assert.equal(validatorSpy1.callCount, 0);
			});

			it(".get does not call validator", async () => {
				const mapData = client1.getRemote(attendee2);
				assert.equal(validatorSpy1.callCount, 0);

				mapData.get("key1");
				assert.equal(validatorSpy1.callCount, 0);
			});

			it("calls validator on key value read", async () => {
				const mapData = client1.getRemote(attendee2);
				const key = mapData.get("key1");
				assert.equal(validatorSpy1.callCount, 0);

				assert.equal(key?.value()?.num, 3);
				assert.equal(validatorSpy1.callCount, 1, "call count is wrong");
			});

			describe("remote data tests", () => {
				let mapData: ReadonlyMap<string, LatestData<TestData, ProxiedValueAccessor<TestData>>>;

				beforeEach(() => {
					mapData = client1.getRemote(attendee2);
				});

				it("calls validator only once if data is unchanged", async () => {
					// Reading the remote value should cause the validator to be called the first time,
					// but subsequent reads should not
					assert.equal(mapData.get("key1")?.value()?.num, 3);
					assert.equal(validatorSpy1.callCount, 1, "first call count is wrong");

					assert.equal(mapData.get("key1")?.value()?.num, 3);
					assert.equal(mapData.get("key1")?.value()?.num, 3);
					assert.equal(validatorSpy1.callCount, 1, "subsequent call count is wrong");
				});

				it("calls validator when remote key data has changed", async () => {
					// Get the remote data and read it, verify that the validator is called once.
					mapData = client1.getRemote(attendee2);
					assert.equal(mapData.get("key1")?.value()?.num, 3);
					assert.equal(validatorSpy1.callCount, 1, "first call count is wrong");

					// Client 2 sets a new local value
					client2.local.set("key1", { num: 22 });
					assert.equal(client2.local.get("key1")?.num, 22, "client2.local value is wrong");

					// Wait for the remote data to get to client 1
					await event.RemoteMapUpdated(client1, "client1");

					// Reading the remote value should cause the validator to be called a second time since the data has been
					// changed.
					const mapData2 = client1.getRemote(attendee2);
					assert.equal(
						mapData2.get("key1")?.value()?.num,
						22,
						"third getRemote(attendee2) count is wrong",
					);
					assert.equal(validatorSpy1.callCount, 2);
				});

				// FIXME: Should this test pass?
				it.skip("does not call validator when a different key is changed", async () => {
					// Get the remote data and read it, verify that the validator is called once.
					mapData = client1.getRemote(attendee2);
					assert.equal(mapData.get("key1")?.value()?.num, 3);
					assert.equal(validatorSpy1.callCount, 1, "first call count is wrong");

					// Client 2 sets a new local value for a different key
					client2.local.set("key2", { num: 22 });
					assert.equal(client2.local.get("key2")?.num, 22, "client2.local value is wrong");

					// Wait for the remote data to get to client 1
					await event.RemoteMapUpdated(client1, "client1");

					// Reading the remote value for key 1should not cause the validator to be called a second time.
					const mapData2 = client1.getRemote(attendee2);
					assert.equal(
						mapData.get("key1")?.value()?.num,
						3,
						"third getRemote(attendee2) count is wrong",
					);
					assert.equal(validatorSpy1.callCount, 1, "call count is wrong");

					// Reading key2's value will call the validator
					assert.equal(mapData.get("key2")?.value()?.num, 22);
					assert.equal(validatorSpy1.callCount, 2, "call count is wrong");
				});

				it("client2 sees initial data from client1", async () => {
					// Second client should see the initial value for client 1
					mapData = client2.getRemote(attendee1);
					assert.equal(mapData.get("key1")?.value()?.num, 0);

					// Second client should have called the validator once for the read above
					assert.equal(validatorSpy2.callCount, 1, "call count is wrong");
				});
			});
		});
	});
});
