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
	StateFactory,
	type Attendee,
	type ExperimentalPresenceDO,
	type Presence,
	type StateSchemaValidator,
} from "../index.js";

import { createTinyliciousClient } from "./TinyliciousClientFactory.js";
import { type ValidatorSpy, createSpiedValidator, createNullValidator } from "./testUtils.js";

interface TestData {
	num: number;
}

async function waitForAttendeeEvent(
	event: "attendeeDisconnected" | "attendeeConnected",
	...presences: Presence[]
): Promise<Attendee[]> {
	return Promise.all(
		presences.map(async (presence, index) =>
			timeoutPromise<Attendee>(
				(resolve) => presence.attendees.events.on(event, (attendee) => resolve(attendee)),
				{
					durationMs: 2000,
					errorMsg: `Attendee[${index}] Timeout`,
				},
			),
		),
	);
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

	let validatorFunction1: StateSchemaValidator<TestData>;
	let validatorFunction2: StateSchemaValidator<TestData>;
	let validatorSpy1: ValidatorSpy;
	let validatorSpy2: ValidatorSpy;

	beforeEach(() => {
		[validatorFunction1, validatorSpy1] = createSpiedValidator<TestData>(
			createNullValidator(),
		);
		[validatorFunction2, validatorSpy2] = createSpiedValidator<TestData>(
			createNullValidator(),
		);
	});

	afterEach(async () => {
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

	describe.skip("LatestValueManager", () => {
		it("multiclient presence data validation", async () => {
			// SETUP
			const {
				// container: container1,
				presence: presence1,
				containerId,
			} = await getOrCreatePresenceContainer(undefined, user1);
			const { presence: presence2 } = await getOrCreatePresenceContainer(containerId, user2);
			const { presence: presence3 } = await getOrCreatePresenceContainer(containerId, user3);

			// Wait for attendees to join
			const attendees = await waitForAttendeeEvent(
				"attendeeConnected",
				presence1,
				presence2,
				presence3,
			);

			const [_, attendee2] = [
				presence1.attendees.getMyself(),
				presence2.attendees.getMyself(),
				presence3.attendees.getMyself(),
			];

			// FIXME: These events never seem to be triggered
			// presence1.events.on("workspaceActivated", (addr, type) => {
			// 	console.log(`1workspaceActivated: ${addr}, ${type}`);
			// 	assert.equal(addr, "name:testStateWorkspace");
			// });

			// presence2.events.on("workspaceActivated", (addr, type) => {
			// 	console.log(`2workspaceActivated: ${addr}, ${type}`);
			// 	assert.equal(addr, "name:testStateWorkspace");
			// });

			// Configure a state workspace
			const stateWorkspace1 = presence1.states.getWorkspace("name:testStateWorkspace", {
				count: StateFactory.latest({
					local: { num: 0 } satisfies TestData,
					validator: validatorFunction1,
					settings: { allowableUpdateLatencyMs: 0 },
				}),
			});

			const stateWorkspace2 = presence2.states.getWorkspace("name:testStateWorkspace", {
				count: StateFactory.latest({
					local: { num: 1 } satisfies TestData,
					validator: validatorFunction2,
					settings: { allowableUpdateLatencyMs: 0 },
				}),
			});

			// const attendees = await waitForAttendeeEvent(
			// 	"attendeeConnected",
			// 	presence1,
			// 	presence2,
			// 	presence3,
			// );
			assert.equal(attendees.length, 3, "attendees length is wrong");
			console.log(`Attendees: ${attendees.map((a) => a.attendeeId).join(", ")}`);

			// Act & Verify
			const { count: count1 } = stateWorkspace1.states;
			const { count: count2 } = stateWorkspace2.states;

			// await timeoutPromise(
			// 	(resolve) =>
			// 		count2.events.on("remoteUpdated", (_) => {
			// 			console.log("remoteUpdated2");
			// 			return resolve();
			// 		}),
			// 	{
			// 		durationMs: 2000,
			// 		errorMsg: `Attendee Timeout`,
			// 	},
			// );

			// count1.local = { num: 11 };
			// assert.equal(count1.local.num, 11, "count1 count is wrong");

			// await timeoutPromise<Attendee>(
			// 	(resolve) => count2.events.on("remoteUpdated", (attendee) => resolve(attendee)),
			// 	{
			// 		durationMs: 2000,
			// 		errorMsg: `AttendeeTimeout`,
			// 	},
			// );

			count2.local = { num: 22 };
			assert.equal(count2.local.num, 22, "count2 count is wrong");

			// await timeoutPromise((resolve) => count1.events.on("remoteUpdated", (_) => resolve()), {
			// 	durationMs: 2000,
			// 	errorMsg: `Attendee Timeout`,
			// });

			await timeoutPromise(
				(resolve) =>
					count1.events.on("remoteUpdated", () => {
						console.log("remoteUpdated1");
						return resolve();
					}),
				{
					durationMs: 2000,
					errorMsg: `Attendee Timeout`,
				},
			);

			const remoteData = count1.getRemote(attendee2);
			const attendee2Data = remoteData.value();

			// const remoteData2 = count2.getRemote(attendee1);
			// const value2 = remoteData2.value();

			assert.deepEqual(attendee2Data, { num: 22 }, "attendee 2 has wrong data");
			// assert.deepEqual(value2, { num: 11 }, "attendee 1 has wrong data");
			assert.equal(validatorSpy1.callCount, 1);
			assert.equal(validatorSpy2.callCount, 0);
			return;
		});
	});
});
