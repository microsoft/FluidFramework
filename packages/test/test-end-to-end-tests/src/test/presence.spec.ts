/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { describeCompat } from "@fluid-private/test-version-utils";
import {
	IContainer,
	IProvideRuntimeFactory,
} from "@fluidframework/container-definitions/internal";
import { ConnectionState } from "@fluidframework/container-loader";
import {
	IPresence,
	Latest,
	ISessionClient,
	// eslint-disable-next-line import/no-internal-modules
} from "@fluidframework/presence/alpha";
// eslint-disable-next-line import/no-internal-modules
import { PresenceManagerFactory } from "@fluidframework/presence/internal/datastorePresenceManagerFactory";
import {
	createTestContainerRuntimeFactory,
	type ITestObjectProvider,
	getContainerEntryPointBackCompat,
	timeoutPromise as timeoutPromiseUnnamed,
	TimeoutWithError,
	TimeoutWithValue,
} from "@fluidframework/test-utils/internal";

interface IPresenceManagerDataObject {
	presenceManager(): IPresence;
}

async function timeoutPromise<T = void>(
	executor: (controller: {
		resolve: (value: T | PromiseLike<T>) => void;
		reject: (reason?: any) => void;
	}) => void,
	timeoutOptions: TimeoutWithError | TimeoutWithValue<T> = {},
): Promise<T> {
	return timeoutPromiseUnnamed(
		(resolve, reject) => executor({ resolve, reject }),
		timeoutOptions,
	);
}
async function waitForAttendeeEvent(
	event: "attendeeDisconnected" | "attendeeJoined",
	...presences: IPresence[]
) {
	return Promise.all(
		presences.map(async (presence, index) =>
			timeoutPromise<ISessionClient>(
				({ resolve }) => presence.events.on(event, (attendee) => resolve(attendee)),
				{
					durationMs: 2000,
					errorMsg: `Signaller[${index}] Timeout`,
				},
			),
		),
	);
}

function verifyAttendee(actual: ISessionClient, expected: ISessionClient) {
	assert.equal(actual.getConnectionId(), expected.getConnectionId(), "ConnectionId mismatch");
	assert.equal(
		actual.getConnectionStatus(),
		expected.getConnectionStatus(),
		"ConnectionStatus mismatch",
	);
	assert.equal(actual.sessionId, expected.sessionId, "SessionId mismatch");
}

describeCompat("Presence", "NoCompat", (getTestObjectProvider, apis) => {
	const TestContainerRuntimeFactory = createTestContainerRuntimeFactory(
		apis.containerRuntime.ContainerRuntime,
	);
	const runtimeFactory: IProvideRuntimeFactory = {
		IRuntimeFactory: new TestContainerRuntimeFactory(
			"@fluidframework/presence",
			new PresenceManagerFactory().factory,
			{},
		),
	};

	let provider: ITestObjectProvider;

	const createContainer = async (): Promise<IContainer> =>
		provider.createContainer(runtimeFactory);
	const loadContainer = async (): Promise<IContainer> =>
		provider.loadContainer(runtimeFactory);

	const getPresence = async (container: IContainer): Promise<IPresence> => {
		const presence =
			await getContainerEntryPointBackCompat<IPresenceManagerDataObject>(container);
		return presence.presenceManager();
	};

	beforeEach("getTestObjectProvider", () => {
		provider = getTestObjectProvider();
	});

	describe("States", () => {
		const testStatesSchema = {
			latest: Latest({}),
		};
		describe("with single client", () => {
			let presence: IPresence;

			beforeEach("create container and get presence", async function () {
				const container = await createContainer();
				presence = await getPresence(container);

				// need to be connected to send signals
				if (container.connectionState !== ConnectionState.Connected) {
					await new Promise((resolve) => container.once("connected", resolve));
				}
			});

			it("can be created", () => {
				const testStates = presence.getStates("name:test-states", testStatesSchema);
				testStates.props.latest.local = { test: 1 };

				assert.deepEqual(testStates.props.latest.local, { test: 1 });
			});
		});
	});
	describe("attendee support", () => {
		describe("with single client", () => {
			let container: IContainer;
			let presence: IPresence;

			beforeEach("create container and get presence", async function () {
				container = await createContainer();
				presence = await getPresence(container);

				// need to be connected to send signals
				if (container.connectionState !== ConnectionState.Connected) {
					await new Promise((resolve) => container.once("connected", resolve));
				}
			});

			it("updates session client status when disconnected", async function () {
				// ACT
				container.disconnect();

				// VERIFY
				assert.equal(presence.getMyself().getConnectionStatus(), "Disconnected");
			});
		});
		describe("with multiple clients", () => {
			let container1: IContainer;
			let container2: IContainer;
			let container3: IContainer;
			let presence1: IPresence;
			let presence2: IPresence;
			let presence3: IPresence;

			beforeEach("create containers and presences", async function () {
				container1 = await createContainer();
				container2 = await loadContainer();
				container3 = await loadContainer();

				presence1 = await getPresence(container1);
				presence2 = await getPresence(container2);
				presence3 = await getPresence(container3);

				// need to be connected to send signals
				if (container1.connectionState !== ConnectionState.Connected) {
					await new Promise((resolve) => container1.once("connected", resolve));
				}
				if (container2.connectionState !== ConnectionState.Connected) {
					await new Promise((resolve) => container2.once("connected", resolve));
				}
				if (container3.connectionState !== ConnectionState.Connected) {
					await new Promise((resolve) => container2.once("connected", resolve));
				}
			});

			it("announces 'attendeeDisconnected' when remote client disconnects", async () => {
				// SETUP
				const disconnectedAttendee = presence3.getMyself();

				// ACT - disconnect client 3
				container3.disconnect();

				// VERIFY - client 1 and 2 receive 'attendeeDisconnected' event with correct attendee
				const disconnectedAttendees = await waitForAttendeeEvent(
					"attendeeDisconnected",
					presence1,
					presence2,
				);
				assert.equal(disconnectedAttendees.length, 2);
				verifyAttendee(disconnectedAttendees[0], disconnectedAttendee);
				verifyAttendee(disconnectedAttendees[1], disconnectedAttendee);
			});
		});
	});
});
