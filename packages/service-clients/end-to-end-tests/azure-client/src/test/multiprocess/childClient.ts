/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

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
	type LatestRaw,
	type LatestMapRaw,
	type StatesWorkspace,
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

function isStringOrNumberRecord(value: unknown): value is Record<string, string | number> {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		return false;
	}
	for (const key of Object.keys(value)) {
		if (!(typeof value[key] === "string" || typeof value[key] === "number")) {
			return false;
		}
	}
	return true;
}

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
type WorkspaceSchema = {
	latest?: ReturnType<typeof StateFactory.latest<{ value: string }>>;
	latestMap?: ReturnType<
		typeof StateFactory.latestMap<{ value: Record<string, string | number> }, string>
	>;
};

class MessageHandler {
	public presence: Presence | undefined;
	public container: IFluidContainer | undefined;
	public containerId: string | undefined;
	private readonly workspaces = new Map<string, StatesWorkspace<WorkspaceSchema>>();

	private registerWorkspace(
		workspaceId: string,
		options: { latest?: boolean; latestMap?: boolean },
	): void {
		if (!this.presence) {
			send({ event: "error", error: `${process_id} is not connected to presence` });
			return;
		}
		const { latest, latestMap } = options;
		const existingWorkspace = this.workspaces.get(workspaceId);
		const workspace: StatesWorkspace<WorkspaceSchema> =
			existingWorkspace ??
			this.presence.states.getWorkspace(`test:${workspaceId}`, {});

		if (latest && !workspace.states.latest) {
			workspace.add(
				"latest",
				StateFactory.latest<{ value: string }>({ local: { value: "initial" } }),
			);
			const latestState = workspace.states.latest as LatestRaw<{ value: string }>;
			latestState.events.on("remoteUpdated", (update) => {
				if (update.value.value !== "initial") {
					send({
						event: "latestValueUpdated",
						workspaceId,
						attendeeId: update.attendee.attendeeId,
						value: update.value.value,
					});
				}
			});
		}

		if (latestMap && !workspace.states.latestMap) {
			workspace.add(
				"latestMap",
				StateFactory.latestMap<{ value: Record<string, string | number> }, string>({
					local: {},
				}),
			);
			const latestMapState = workspace.states.latestMap as LatestMapRaw<
				{ value: Record<string, string | number> },
				string
			>;
			latestMapState.events.on("remoteUpdated", (update) => {
				for (const [key, valueWithMetadata] of update.items) {
					send({
						event: "latestMapValueUpdated",
						workspaceId,
						attendeeId: update.attendee.attendeeId,
						key: String(key),
						value: valueWithMetadata.value.value,
					});
				}
			});
		}
		this.workspaces.set(workspaceId, workspace);
		send({
			event: "workspaceRegistered",
			workspaceId,
			latest: latest ?? false,
			latestMap: latestMap ?? false,
		});
	}

	public async onMessage(msg: MessageFromParent): Promise<void> {
		switch (msg.command) {
			case "ping": {
				send({ event: "ack" });
				break;
			}

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

				// Workspaces are now registered on-demand via registerWorkspace command

				send({
					event: "connected",
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

			// Set the Latest value for the given workspace
			case "setLatestValue": {
				if (!this.presence) {
					send({ event: "error", error: `${process_id} is not connected to presence` });
					break;
				}
				const workspace = this.workspaces.get(msg.workspaceId);
				const latestState = workspace?.states.latest as LatestRaw<{ value: string }>;
				if (latestState === undefined) {
					send({
						event: "error",
						error: `${process_id} workspace ${msg.workspaceId} not found`,
					});
					break;
				}

				if (typeof msg.value !== "string") {
					break;
				}

				latestState.local = { value: msg.value };
				break;
			}

			// Set the Latest Map value for the given workspace
			case "setLatestMapValue": {
				if (!this.presence) {
					send({ event: "error", error: `${process_id} is not connected to presence` });
					break;
				}
				if (typeof msg.key !== "string") {
					send({ event: "error", error: `${process_id} invalid key type` });
					break;
				}
				const workspace = this.workspaces.get(msg.workspaceId);
				const latestMapState = workspace?.states.latestMap as LatestMapRaw<
					{ value: Record<string, string | number> },
					string
				>;
				if (latestMapState === undefined) {
					send({
						event: "error",
						error: `${process_id} map workspace ${msg.workspaceId} not found`,
					});
					break;
				}

				if (!isStringOrNumberRecord(msg.value)) {
					break;
				}

				latestMapState.local.set(msg.key, { value: msg.value });
				break;
			}

			// Get the Latest value for the given workspace and attendee
			case "getLatestValue": {
				if (!this.presence) {
					send({ event: "error", error: `${process_id} is not connected to presence` });
					break;
				}
				const workspace = this.workspaces.get(msg.workspaceId);
				const latestState = workspace?.states.latest as LatestRaw<{ value: string }>;
				if (latestState === undefined) {
					send({
						event: "error",
						error: `${process_id} workspace ${msg.workspaceId} not found`,
					});
					break;
				}

				let value: { value: string };
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
					value: value.value,
				});

				break;
			}

			// Register a new workspace
			case "registerWorkspace": {
				this.registerWorkspace(msg.workspaceId, {
					latest: msg.latest,
					latestMap: msg.latestMap,
				});
				break;
			}

			// Get the Latest Map value for the given workspace and attendee
			case "getLatestMapValue": {
				if (!this.presence) {
					send({ event: "error", error: `${process_id} is not connected to presence` });
					break;
				}
				if (typeof msg.key !== "string") {
					send({ event: "error", error: `${process_id} invalid key type` });
					break;
				}
				const workspace = this.workspaces.get(msg.workspaceId);
				const latestMapState = workspace?.states.latestMap as LatestMapRaw<
					{ value: Record<string, string | number> },
					string
				>;
				if (latestMapState === undefined) {
					send({
						event: "error",
						error: `${process_id} workspace ${msg.workspaceId} not found`,
					});
					break;
				}

				let value: { value: Record<string, string | number> } | undefined;
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
					value: value?.value,
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
