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
	type ExperimentalPresenceDO,
	type Presence,
	type ProxiedValueAccessor,
	type StateSchemaValidator,
} from "../index.js";

import { createTinyliciousClient } from "./TinyliciousClientFactory.js";
import { type ValidatorSpy, createSpiedValidator, createNullValidator } from "./testUtils.js";
import type { Off } from "@fluidframework/core-interfaces";

interface TestData {
	num: number;
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

describe(`Presence with TinyliciousClient`, () => {
	// let validatorFunction1: StateSchemaValidator<TestData>;
	// let validatorFunction2: StateSchemaValidator<TestData>;
	// let validatorSpy1: ValidatorSpy;
	// let validatorSpy2: ValidatorSpy;

	// beforeEach(() => {
	// 	[validatorFunction1, validatorSpy1] = createSpiedValidator<TestData>(
	// 		createNullValidator(),
	// 	);
	// 	[validatorFunction2, validatorSpy2] = createSpiedValidator<TestData>(
	// 		createNullValidator(),
	// 	);
	// });

	afterEach(() => {
		console.log(`connected containers before cleanup: ${connectedContainers.length}`);
		for (const container of connectedContainers) {
			console.log(`cleanup called`);
			container.disconnect();
			container.dispose();
		}
		connectedContainers.splice(0, connectedContainers.length);
		console.log(`connected containers after: ${connectedContainers.length}`);

		console.log(`removing ${listeners.length} listeners`);
		for (const removeListener of listeners) {
			removeListener();
		}
		listeners.splice(0, listeners.length);
		console.log(`listeners: ${listeners.length}`);
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

	describe("LatestValueManager", () => {
		it("getOrCreatePresenceContainer works", async () => {
			// SETUP
			const {
				// container: container1,
				presence: presence1,
				containerId,
			} = await getOrCreatePresenceContainer(undefined, user1);
			// await waitForAttendeeEvent("attendeeConnected", presence1);
			assert.notEqual(presence1, undefined);

			const attendee = await timeoutPromise<Attendee>(
				(resolve) => {
					const off = presence1.attendees.events.on("attendeeConnected", (attendee) => {
						off();
						resolve(attendee);
					});
					listeners.push(off);
				},
				{
					errorMsg: `Attendee[0] Timeout`,
				},
			);
			assert.notEqual(attendee, undefined);
		});

		it.skip("multiclient presence data validation", async () => {
			// SETUP
			const {
				// container: container1,
				presence: presence1,
				containerId,
			} = await getOrCreatePresenceContainer(undefined, user1);

			await waitForAttendeeEvent("attendeeConnected", presence1);
			assert.notEqual(presence1, undefined);

			// 	const { presence: presence2 } = await getOrCreatePresenceContainer(containerId, user2);
			// 	const { presence: presence3 } = await getOrCreatePresenceContainer(containerId, user3);

			// 	// Wait for attendees to join
			// 	const attendees = await waitForAttendeeEvent(
			// 		"attendeeConnected",
			// 		// presence1,
			// 		presence2,
			// 		presence3,
			// 	);

			// 	const [_, attendee2] = [
			// 		presence1.attendees.getMyself(),
			// 		presence2.attendees.getMyself(),
			// 		presence3.attendees.getMyself(),
			// 	];

			// 	// Configure a state workspace
			// 	// const stateWorkspace1 = presence1.states.getWorkspace("name:testStateWorkspace", {
			// 	// 	count: StateFactory.latest({
			// 	// 		local: { num: 0 } satisfies TestData,
			// 	// 		validator: validatorFunction1,
			// 	// 		settings: { allowableUpdateLatencyMs: 0 },
			// 	// 	}),
			// 	// });

			// 	// const stateWorkspace2 = presence2.states.getWorkspace("name:testStateWorkspace", {
			// 	// 	count: StateFactory.latest({
			// 	// 		local: { num: 1 } satisfies TestData,
			// 	// 		validator: validatorFunction2,
			// 	// 		settings: { allowableUpdateLatencyMs: 0 },
			// 	// 	}),
			// 	// });

			// 	assert.equal(attendees.length, 3, "attendees length is wrong");
			// 	console.log(`Attendees: ${attendees.map((a) => a.attendeeId).join(", ")}`);

			// 	// Act & Verify
			// 	// const { count: count1 } = stateWorkspace1.states;
			// 	// const { count: count2 } = stateWorkspace2.states;

			// 	// await timeoutPromise<LatestClientData<TestData, ProxiedValueAccessor<TestData>>>(
			// 	// 	(resolve) =>
			// 	// 		count2.events.on("remoteUpdated", (data) => {
			// 	// 			console.log(`remoteUpdated: ${JSON.stringify(data)}`);
			// 	// 			resolve(data);
			// 	// 		}),
			// 	// 	{
			// 	// 		durationMs: 2000,
			// 	// 		errorMsg: `remoteUpdated Timeout`,
			// 	// 	},
			// 	// );

			// 	// timeoutPromise<Attendee>(
			// 	// 	(resolve) => presence.attendees.events.on(event, (attendee) => resolve(attendee)),
			// 	// 	{
			// 	// 		durationMs: 10000,
			// 	// 		errorMsg: `Attendee[${index}] Timeout`,
			// 	// 	},
			// 	// ),

			// 	// await timeoutPromise<{ value: TestData }>(
			// 	// 	(resolve) =>
			// 	// 		count2.events.on("localUpdated", (data) => {
			// 	// 			console.log("localUpdated");
			// 	// 			resolve(data);
			// 	// 		}),
			// 	// 	{
			// 	// 		durationMs: 2000,
			// 	// 		errorMsg: `localUpdated Timeout`,
			// 	// 	},
			// 	// );

			// 	// count2.local = { num: 22 };
			// 	// assert.equal(count2.local.num, 22, "count2 count is wrong");

			// 	// count1.local = { num: 11 };
			// 	// assert.equal(count1.local.num, 11, "count1 count is wrong");

			// 	// await timeoutPromise((resolve) => count1.events.on("remoteUpdated", () => resolve()), {
			// 	// 	durationMs: 2000,
			// 	// 	errorMsg: `Attendee Timeout`,
			// 	// });

			// 	// count2.local = { num: 22 };
			// 	// assert.equal(count2.local.num, 22, "count2 count is wrong");

			// 	// let remoteData = count1.getRemote(attendee2);
			// 	// let attendee2Data = remoteData.value();
			// 	// remoteData = count1.getRemote(attendee2);
			// 	// attendee2Data = remoteData.value();

			// 	// assert.deepEqual(attendee2Data, { num: 22 }, "attendee 2 has wrong data");
			// 	// assert.deepEqual(value2, { num: 11 }, "attendee 1 has wrong data");
			// 	// assert.equal(validatorSpy1.callCount, 1);
			// 	// assert.equal(validatorSpy2.callCount, 0);
		});
	});
});
