/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { AttachState } from "@fluidframework/container-definitions";
import { ConnectionState } from "@fluidframework/container-loader";
import type { Off } from "@fluidframework/core-interfaces";
import type {
	DeepReadonly,
	JsonDeserialized,
} from "@fluidframework/core-interfaces/internal/exposedUtilityTypes";
import type { ScopeType } from "@fluidframework/driver-definitions/internal";
import { timeoutPromise } from "@fluidframework/test-utils/internal";
import type {
	TinyliciousClient,
	TinyliciousContainerServices,
	TinyliciousUser,
} from "@fluidframework/tinylicious-client";
import { SharedTree } from "fluid-framework";
import type { ContainerSchema, IFluidContainer } from "fluid-framework";

import { createTinyliciousClient } from "./TinyliciousClientFactory.js";
import { createSpiedValidator } from "./testUtils.js";

import { getPresence, StateFactory } from "@fluidframework/presence/beta";
import type {
	Attendee,
	InternalTypes,
	Latest,
	LatestClientData,
	LatestData,
	LatestMap,
	LatestMapClientData,
	Presence,
	ProxiedValueAccessor,
	StatesWorkspace,
	WorkspaceAddress,
} from "@fluidframework/presence/beta";

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
		await timeoutPromise<DeepReadonly<JsonDeserialized<T>>>(
			(resolve) =>
				latestData.events.on("localUpdated", (data) => {
					// FIXME
					// @ts-expect-error Type 'null' is not assignable to type 'DeepReadonly<JsonDeserialized<T>> | PromiseLike<DeepReadonly<JsonDeserialized<T>>>'.
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

	let validatorFunction1: ReturnType<typeof createSpiedValidator<TestData>>;
	let validatorFunction2: ReturnType<typeof createSpiedValidator<TestData>>;
	let validatorFunction3: ReturnType<typeof createSpiedValidator<TestData>>;

	let attendee1: Attendee;
	let attendee2: Attendee;

	beforeEach(() => {
		validatorFunction1 = createSpiedValidator<TestData>();
		validatorFunction2 = createSpiedValidator<TestData>();
		validatorFunction3 = createSpiedValidator<TestData>();
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
		const schema = {
			initialObjects: {
				appData: SharedTree,
			},
		} satisfies ContainerSchema;
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

		const presence = getPresence(container);
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

		describe("Latest validator", () => {
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
			let data: LatestData<TestData, ProxiedValueAccessor<TestData>>;

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
				data = client1.getRemote(attendee2);
			});

			describe("is not called", () => {
				it("by .getRemote()", async () => {
					client1.getRemote(attendee2);
					assert.equal(validatorFunction1.callCount, 0);
				});

				it("by local .value()", () => {
					client1.local = { num: 33 };
					assert.equal(validatorFunction1.callCount, 0, "initial call count is wrong");
					assert.equal(client1.local.num, 33);
					assert.equal(validatorFunction1.callCount, 0, "validator was called on local data");
				});

				// FIXME test should pass
				it.skip("if validator has already returned undefined", async () => {
					// client1 sends some invalid data
					client1.local = "string" as unknown as TestData;

					// Second client should see the initial value for client 1
					data = client2.getRemote(attendee1);
					assert.equal(
						data?.value(),
						undefined,
						"validator returned a value for invalid data",
					);

					// Second client should have called the validator once for the read above
					assert.equal(validatorFunction2.callCount, 1, "callCount is wrong");

					// Subsequent read should return the same value and not call the validator
					assert.equal(data?.value()?.num, undefined, "second data access returned a value");
					assert.equal(validatorFunction2.callCount, 1, "second callCount is wrong");
				});
			});

			describe("is called", () => {
				it("on value read", async () => {
					// Reading the remote value should cause the validator to be called
					assert.equal(client1.getRemote(attendee2)?.value()?.num, 1);
					assert.equal(validatorFunction1.callCount, 1, "call count is wrong");
				});

				it("only once if data is unchanged", async () => {
					// Reading the remote value should cause the validator to be called the first time,
					// but subsequent reads should not
					assert.equal(data?.value()?.num, 1);
					assert.equal(validatorFunction1.callCount, 1, "first call count is wrong");

					assert.equal(data?.value()?.num, 1);
					assert.equal(data?.value()?.num, 1);
					assert.equal(validatorFunction1.callCount, 1, "subsequent call count is wrong");
				});

				it("when remote data has changed", async () => {
					// Get the remote data and read it, verify that the validator is called once.
					data = client1.getRemote(attendee2);
					assert.equal(data?.value()?.num, 1);
					assert.equal(validatorFunction1.callCount, 1, "first call count is wrong");

					// Client 2 sets a new local value
					client2.local = { num: 22 };
					assert.equal(client2.local.num, 22, "client2.local value is wrong");

					// Wait for the remote data to get to client 1
					await event.RemoteUpdated(client1, "client1");

					// Reading the remote value should cause the validator to be called a second time since the data has been
					// changed.
					const data2 = client1.getRemote(attendee2);
					assert.equal(data2?.value()?.num, 22, "third getRemote(attendee2) count is wrong");
					assert.equal(validatorFunction1.callCount, 2);
				});
			});

			it("returns undefined through proxied value accessor when remote data is invalid", async () => {
				// Setup

				// Second client should see the initial value for client 1
				data = client2.getRemote(attendee1);
				assert.equal(data?.value()?.num, 0, "initial value is not correct");

				// Second client should have called the validator once for the read above
				assert.equal(validatorFunction2.callCount, 1, "callCount is wrong");
			});
		});

		describe("LatestMap validator", () => {
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

				const stateManager = StateFactory.latestMap({
					local: { key1: { num: 0 }, key2: { num: 0 } } satisfies TestMapData,
					validator: validatorFunction1,
					settings: { allowableUpdateLatencyMs: 0 },
				});

				// Configure a state workspace on client 1
				stateWorkspace1 = presence1.states.getWorkspace("name:testStateWorkspace", {
					testData: stateManager,
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

			describe("is called", () => {
				it("when a key value is read", async () => {
					const mapData = client1.getRemote(attendee2);
					const key = mapData.get("key1");
					assert.equal(key?.value()?.num, 3);
					assert.equal(validatorFunction1.callCount, 1, "call count is wrong");
				});

				it("when remote key data has changed", async () => {
					// Get the remote data and read it, verify that the validator is called once.
					assert.equal(client1.getRemote(attendee2).get("key1")?.value()?.num, 3);
					assert.equal(validatorFunction1.callCount, 1, "first call count is wrong");

					// Client 2 sets a new local value
					client2.local.set("key1", { num: 22 });
					assert.equal(client2.local.get("key1")?.num, 22, "client2.local value is wrong");

					// Wait for the remote data to get to client 1
					await event.RemoteMapUpdated(client1, "client1");

					// Reading the remote value should cause the validator to be called a second time since the data has been
					// changed.
					assert.equal(
						client1.getRemote(attendee2).get("key1")?.value()?.num,
						22,
						"third getRemote(attendee2) count is wrong",
					);
					assert.equal(validatorFunction1.callCount, 2);
				});

				it("only once if data is unchanged", async () => {
					// Reading the remote value should cause the validator to be called the first time,
					// but subsequent reads should not
					assert.equal(client1.getRemote(attendee2).get("key1")?.value()?.num, 3);
					assert.equal(validatorFunction1.callCount, 1, "first call count is wrong");

					assert.equal(client1.getRemote(attendee2).get("key1")?.value()?.num, 3);
					assert.equal(client1.getRemote(attendee2).get("key1")?.value()?.num, 3);
					assert.equal(validatorFunction1.callCount, 1, "subsequent call count is wrong");
				});
			});

			describe("is not called", () => {
				it("by .getRemote()", async () => {
					client1.getRemote(attendee2);
					assert.equal(validatorFunction1.callCount, 0);
				});

				it("by .get()", async () => {
					const mapData = client1.getRemote(attendee2);
					assert.equal(validatorFunction1.callCount, 0);

					mapData.get("key1");
					assert.equal(validatorFunction1.callCount, 0);
				});

				// FIXME test should pass
				it.skip("when a different key is changed", async () => {
					// Get the remote data and read it, verify that the validator is called once.
					assert.equal(client1.getRemote(attendee2).get("key1")?.value()?.num, 3);
					assert.equal(validatorFunction1.callCount, 1, "first call count is wrong");

					// Client 2 sets a new local value for a different key
					client2.local.set("key2", { num: 22 });
					assert.equal(client2.local.get("key2")?.num, 22, "client2.local value is wrong");

					// Wait for the remote data to get to client 1
					await event.RemoteMapUpdated(client1, "client1");

					// Reading the remote value for key 1 should not cause the validator to be called a second time.
					const key = client1.getRemote(attendee2).get("key1");

					assert.equal(key?.value()?.num, 3, "third getRemote(attendee2) count is wrong");
					// FIXME this should pass
					assert.equal(
						validatorFunction1.callCount,
						1,
						"validator called for key1 when key2 has changed",
					);

					// Reading key2's value will call the validator
					assert.equal(client1.getRemote(attendee2).get("key2")?.value()?.num, 22);
					assert.equal(
						validatorFunction1.callCount,
						2,
						"validator not called on unvalidated data",
					);
				});
			});
		});
	});
});
