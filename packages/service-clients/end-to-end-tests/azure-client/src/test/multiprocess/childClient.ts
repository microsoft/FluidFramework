/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any */

import { strict as assert } from "node:assert";

import {
	AzureClient,
	type AzureContainerServices,
	type AzureLocalConnectionConfig,
	type AzureRemoteConnectionConfig,
} from "@fluidframework/azure-client";
import { AttachState } from "@fluidframework/container-definitions";
import { ConnectionState } from "@fluidframework/container-loader";
import type { ContainerSchema, IFluidContainer } from "@fluidframework/fluid-static";
import {
	getPresence,
	type Attendee,
	type Presence,
	StateFactory,
	// eslint-disable-next-line import/no-internal-modules
} from "@fluidframework/presence/beta";
import { InsecureTokenProvider } from "@fluidframework/test-runtime-utils/internal";
import { timeoutPromise } from "@fluidframework/test-utils/internal";

import type { ScopeType } from "../AzureClientFactory.js";
import { createAzureTokenProvider } from "../AzureTokenFactory.js";
import { TestDataObject } from "../TestDataObject.js";
import type { configProvider } from "../utils.js";

import type { MessageFromChild, MessageToChild } from "./messageTypes.js";

type MessageFromParent = MessageToChild;
type MessageToParent = Required<MessageFromChild>;
interface UserIdAndName {
	id: string;
	name: string;
}

const connectTimeoutMs = 10_000;
// Identifier given to child process
const process_id = process.argv[2];

const useAzure = process.env.FLUID_CLIENT === "azure";
const tenantId = useAzure
	? (process.env.azure__fluid__relay__service__tenantId as string)
	: "frs-client-tenant";
const endPoint = process.env.azure__fluid__relay__service__endpoint as string;
if (useAzure && endPoint === undefined) {
	throw new Error("Azure Fluid Relay service endpoint is missing");
}

/**
 * Get or create a Fluid container with Presence in initialObjects.
 */
const getOrCreatePresenceContainer = async (
	id: string | undefined,
	user: UserIdAndName,
	config?: ReturnType<typeof configProvider>,
	scopes?: ScopeType[],
): Promise<{
	container: IFluidContainer;
	presence: Presence;
	services: AzureContainerServices;
	client: AzureClient;
	containerId: string;
}> => {
	let container: IFluidContainer;
	let containerId: string;
	const connectionProps: AzureRemoteConnectionConfig | AzureLocalConnectionConfig = useAzure
		? {
				tenantId,
				tokenProvider: createAzureTokenProvider(user.id ?? "foo", user.name ?? "bar", scopes),
				endpoint: endPoint,
				type: "remote",
			}
		: {
				tokenProvider: new InsecureTokenProvider("fooBar", user, scopes),
				endpoint: "http://localhost:7071",
				type: "local",
			};
	const client = new AzureClient({ connection: connectionProps });
	const schema: ContainerSchema = {
		initialObjects: {
			// A DataObject is added as otherwise fluid-static complains "Container cannot be initialized without any DataTypes"
			_unused: TestDataObject,
		},
	};
	let services: AzureContainerServices;
	if (id === undefined) {
		({ container, services } = await client.createContainer(schema, "2"));
		containerId = await container.attach();
	} else {
		containerId = id;
		({ container, services } = await client.getContainer(containerId, schema, "2"));
	}
	// wait for 'ConnectionState.Connected' so we return with client connected to container
	if (container.connectionState !== ConnectionState.Connected) {
		await timeoutPromise((resolve) => container.once("connected", () => resolve()), {
			durationMs: connectTimeoutMs,
			errorMsg: "container connect() timeout",
		});
	}
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
function createSendFunction(): (msg: MessageToParent) => void {
	if (process.send) {
		return process.send.bind(process);
	}
	throw new Error("process.send is not defined");
}

const send = createSendFunction();

function isConnected(container: IFluidContainer | undefined): boolean {
	return container !== undefined && container.connectionState === ConnectionState.Connected;
}

class MessageHandler {
	public presence: Presence | undefined;
	public container: IFluidContainer | undefined;
	public containerId: string | undefined;
	// Use any to simplify typing issues - we'll handle type safety at runtime
	private readonly latestStates = new Map<string, any>();
	private readonly latestMapStates = new Map<string, any>();

	private preCreateTestWorkspaces(): void {
		if (!this.presence) {
			return;
		}

		// Pre-create common test workspaces to ensure all clients have the same setup
		const testWorkspaces = [
			"testLatestWorkspace",
			"testLatestMapWorkspace",
			"testMultiKeyMap",
		];

		for (const workspaceId of testWorkspaces) {
			// Create Latest workspace
			const latestWorkspace = this.presence.states.getWorkspace(
				`test:${workspaceId}` as const,
				{
					latestValue: StateFactory.latest<object | null>({ local: {} }),
				},
			);
			const latestState = latestWorkspace.states.latestValue;
			this.latestStates.set(workspaceId, latestState);

			// Set up event listeners on the state object
			latestState.events.on("remoteUpdated", (update) => {
				send({
					event: "latestValueUpdated",
					workspaceId,
					attendeeId: update.attendee.attendeeId,
					value: update.value,
				});
			});

			// Create LatestMap workspace
			const latestMapWorkspace = this.presence.states.getWorkspace(
				`test:${workspaceId}` as const,
				{
					latestMap: StateFactory.latestMap<object | null, string>({ local: {} }),
				},
			);
			const latestMapState = latestMapWorkspace.states.latestMap;
			this.latestMapStates.set(workspaceId, latestMapState);

			// Set up event listeners on the map state object
			latestMapState.events.on("remoteUpdated", (update) => {
				// FluidFramework passes items as a ReadonlyMap, we need to iterate through it
				for (const [key, valueWithMetadata] of update.items) {
					send({
						event: "latestMapValueUpdated",
						workspaceId,
						attendeeId: update.attendee.attendeeId,
						key: String(key),
						value: valueWithMetadata.value, // Extract just the value, not metadata
					});
				}
			});
		}
	}

	public async onMessage(msg: MessageFromParent): Promise<void> {
		switch (msg.command) {
			// Respond to connect command by connecting to Fluid container with the provided user information.
			case "connect": {
				// Check if valid user information has been provided by parent/orchestrator
				if (!msg.user) {
					send({ event: "error", error: `${process_id}: No azure user information given` });
					break;
				}
				// Check if already connected to container
				if (isConnected(this.container)) {
					send({ event: "error", error: `${process_id}: Already connected to container` });
					break;
				}
				const { container, presence, containerId } = await getOrCreatePresenceContainer(
					msg.containerId,
					msg.user,
				);
				this.container = container;
				this.presence = presence;
				this.containerId = containerId;

				// Listen for presence events to notify parent/orchestrator when a new attendee joins or leaves the session.
				presence.attendees.events.on("attendeeConnected", (attendee: Attendee) => {
					const m: MessageToParent = {
						event: "attendeeConnected",
						attendeeId: attendee.attendeeId,
					};
					send(m);
				});
				presence.attendees.events.on("attendeeDisconnected", (attendee: Attendee) => {
					const m: MessageToParent = {
						event: "attendeeDisconnected",
						attendeeId: attendee.attendeeId,
					};
					send(m);
				});

				// Pre-create workspaces that tests will use to ensure all clients are set up identically
				this.preCreateTestWorkspaces();

				send({
					event: "ready",
					containerId,
					attendeeId: presence.attendees.getMyself().attendeeId,
				});

				break;
			}

			// Respond to disconnect command by disconnecting self from Fluid container.
			case "disconnectSelf": {
				if (!this.container) {
					send({ event: "error", error: `${process_id} is not connected to container` });
					break;
				}
				if (!this.presence) {
					send({ event: "error", error: `${process_id} is not connected to presence` });
					break;
				}

				this.container.disconnect();
				send({
					event: "disconnectedSelf",
					attendeeId: this.presence.attendees.getMyself().attendeeId,
				});

				break;
			}

			case "setLatestValue": {
				if (!this.presence) {
					send({ event: "error", error: `${process_id} is not connected to presence` });
					break;
				}

				const latestState = this.latestStates.get(msg.workspaceId);
				if (latestState === undefined) {
					send({
						event: "error",
						error: `${process_id} workspace ${msg.workspaceId} not found`,
					});
					break;
				}
				latestState.local = JSON.parse(JSON.stringify(msg.value));
				break;
			}

			case "setLatestMapValue": {
				if (!this.presence) {
					send({ event: "error", error: `${process_id} is not connected to presence` });
					break;
				}

				const latestMapState = this.latestMapStates.get(msg.workspaceId);
				if (latestMapState === undefined) {
					send({
						event: "error",
						error: `${process_id} map workspace ${msg.workspaceId} not found`,
					});
					break;
				}
				latestMapState.local.set(msg.key, JSON.parse(JSON.stringify(msg.value)));
				break;
			}

			case "getLatestValue": {
				if (!this.presence) {
					send({ event: "error", error: `${process_id} is not connected to presence` });
					break;
				}

				const latestState = this.latestStates.get(msg.workspaceId);
				if (latestState === undefined) {
					send({
						event: "error",
						error: `${process_id} workspace ${msg.workspaceId} not found`,
					});
					break;
				}

				let value: unknown;
				if (msg.attendeeId) {
					const attendee = this.presence.attendees.getAttendee(msg.attendeeId);
					const remoteData = latestState.getRemote(attendee);
					value = remoteData.value;
				} else {
					value = latestState.local;
				}

				send({
					event: "latestValueGetResponse",
					workspaceId: msg.workspaceId,
					attendeeId: msg.attendeeId,
					value,
				});

				break;
			}

			case "getLatestMapValue": {
				if (!this.presence) {
					send({ event: "error", error: `${process_id} is not connected to presence` });
					break;
				}

				const latestMapState = this.latestMapStates.get(msg.workspaceId);
				if (latestMapState === undefined) {
					send({
						event: "error",
						error: `${process_id} workspace ${msg.workspaceId} not found`,
					});
					break;
				}

				let value: unknown;
				if (msg.attendeeId) {
					const attendee = this.presence.attendees.getAttendee(msg.attendeeId);
					const remoteData = latestMapState.getRemote(attendee);
					const keyData = remoteData.get(msg.key);
					value = keyData?.value;
				} else {
					value = latestMapState.local.get(msg.key);
				}

				send({
					event: "latestMapValueGetResponse",
					workspaceId: msg.workspaceId,
					attendeeId: msg.attendeeId,
					key: msg.key,
					value,
				});

				break;
			}

			default: {
				console.error(`${process_id}: Unknown command`);
				send({ event: "error", error: `${process_id} Unknown command` });
				break;
			}
		}
	}
}

function setupMessageHandler(): void {
	const messageHandler = new MessageHandler();
	process.on("message", (msg: MessageFromParent) => {
		messageHandler.onMessage(msg).catch((error: Error) => {
			console.error(`Error in client ${process_id}`, error);
			send({ event: "error", error: `${process_id}: ${error.message}` });
		});
	});
}

setupMessageHandler();
