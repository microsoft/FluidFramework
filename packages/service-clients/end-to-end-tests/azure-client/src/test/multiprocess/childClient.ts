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
	type ITelemetryBaseEvent,
} from "@fluidframework/azure-client";
import { AttachState } from "@fluidframework/container-definitions";
import { ConnectionState } from "@fluidframework/container-loader";
import { LogLevel } from "@fluidframework/core-interfaces";
import type { ScopeType } from "@fluidframework/driver-definitions/legacy";
import type { ContainerSchema, IFluidContainer } from "@fluidframework/fluid-static";
import {
	getPresence,
	type Attendee,
	type Presence,
	StateFactory,
	type LatestRaw,
	type LatestMapRaw,
	type StatesWorkspace,
} from "@fluidframework/presence/beta";
import { InsecureTokenProvider } from "@fluidframework/test-runtime-utils/internal";
import { timeoutPromise } from "@fluidframework/test-utils/internal";

import { createAzureTokenProvider } from "../AzureTokenFactory.js";
import { TestDataObject } from "../TestDataObject.js";

import type { MessageFromChild, MessageToChild, UserIdAndName } from "./messageTypes.js";

type MessageFromParent = MessageToChild;
type MessageToParent = Required<MessageFromChild>;
const connectTimeoutMs = 10_000;
// Identifier given to child process
const process_id = process.argv[2];
const verbosity = process.argv[3] ?? "";

const useAzure = process.env.FLUID_CLIENT === "azure";
const tenantId = useAzure
	? (process.env.azure__fluid__relay__service__tenantId as string)
	: "frs-client-tenant";
const endPoint = process.env.azure__fluid__relay__service__endpoint as string;
if (useAzure && endPoint === undefined) {
	throw new Error("Azure Fluid Relay service endpoint is missing");
}

function selectiveVerboseLog(event: ITelemetryBaseEvent, logLevel?: LogLevel): void {
	if (event.eventName.includes(":Signal") || event.eventName.includes(":Join")) {
		console.log(`[${process_id}] [${logLevel ?? LogLevel.default}]`, {
			eventName: event.eventName,
			details: event.details,
			containerConnectionState: event.containerConnectionState,
		});
	} else if (
		event.eventName.includes(":Container:") ||
		event.eventName.includes(":Presence:")
	) {
		console.log(`[${process_id}] [${logLevel ?? LogLevel.default}]`, {
			eventName: event.eventName,
			containerConnectionState: event.containerConnectionState,
		});
	}
}

/**
 * Get or create a Fluid container with Presence in initialObjects.
 */
const getOrCreatePresenceContainer = async (
	id: string | undefined,
	user: UserIdAndName,
	scopes?: ScopeType[],
	createScopes?: ScopeType[],
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
				tokenProvider: createAzureTokenProvider(
					user.id ?? "foo",
					user.name ?? "bar",
					scopes,
					createScopes,
				),
				endpoint: endPoint,
				type: "remote",
			}
		: {
				tokenProvider: new InsecureTokenProvider("fooBar", user, scopes, createScopes),
				endpoint: "http://localhost:7071",
				type: "local",
			};
	const client = new AzureClient({
		connection: connectionProps,
		logger: {
			send: verbosity.includes("telem") ? selectiveVerboseLog : () => {},
		},
	});
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
		const sendFn = process.send.bind(process);
		if (verbosity.includes("msgs")) {
			return (msg: MessageToParent) => {
				console.log(`[${process_id}] Sending`, msg);
				sendFn(msg);
			};
		}
		return sendFn;
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

	const stringKeys = Object.keys(value);
	const allKeys = Reflect.ownKeys(value);

	if (stringKeys.length !== allKeys.length) {
		// If there are non-string/symbol keys, return false
		return false;
	}
	for (const key of stringKeys) {
		if (!(typeof value[key] === "string" || typeof value[key] === "number")) {
			return false;
		}
	}
	return true;
}

// NOTE:
// - This schema intentionally uses optional keys (latest?, latestMap?) so tests can register
//   states conditionally at runtime.
// - Optional keys are not explicitly supported in StatesWorkspace typing today, which means
//   workspace.states.<key> is typed as any. As a result, usages below require casts
//   (e.g., to LatestRaw / LatestMapRaw) to recover concrete types.
// - Track adding proper optional-key support to Presence state workspace typing here:
//   Work item: AB#47518
// - Fallout: Until the above is addressed, keep the casts in place and document new usages accordingly.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
type WorkspaceSchema = {
	latest?: ReturnType<typeof StateFactory.latest<{ value: string }>>;
	latestMap?: ReturnType<
		typeof StateFactory.latestMap<{ value: Record<string, string | number> }, string>
	>;
};
const WorkspaceSchema: WorkspaceSchema = {};

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
		const workspace: StatesWorkspace<WorkspaceSchema> = this.presence.states.getWorkspace(
			`test:${workspaceId}`,
			WorkspaceSchema,
		);

		if (latest && !workspace.states.latest) {
			workspace.add(
				"latest",
				StateFactory.latest<{ value: string }>({ local: { value: "initial" } }),
			);
			// Cast required due to optional keys in WorkspaceSchema
			// TODO: AB#47518
			const latestState = workspace.states.latest as LatestRaw<{ value: string }>;
			latestState.events.on("remoteUpdated", (update) => {
				send({
					event: "latestValueUpdated",
					workspaceId,
					attendeeId: update.attendee.attendeeId,
					value: update.value.value,
				});
			});
			for (const remote of latestState.getRemotes()) {
				send({
					event: "latestValueUpdated",
					workspaceId,
					attendeeId: remote.attendee.attendeeId,
					value: remote.value.value,
				});
			}
		}

		if (latestMap && !workspace.states.latestMap) {
			workspace.add(
				"latestMap",
				StateFactory.latestMap<{ value: Record<string, string | number> }, string>({
					local: {},
				}),
			);
			// Cast required due to optional keys in WorkspaceSchema
			// TODO: AB#47518
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
			for (const remote of latestMapState.getRemotes()) {
				for (const [key, valueWithMetadata] of remote.items) {
					send({
						event: "latestMapValueUpdated",
						workspaceId,
						attendeeId: remote.attendee.attendeeId,
						key: String(key),
						value: valueWithMetadata.value.value,
					});
				}
			}
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
		if (verbosity.includes("msgs")) {
			console.log(`[${process_id}] Received`, msg);
		}
		switch (msg.command) {
			case "ping": {
				this.handlePing();
				break;
			}
			case "connect": {
				await this.handleConnect(msg);
				break;
			}
			case "disconnectSelf": {
				this.handleDisconnectSelf();
				break;
			}
			case "setLatestValue": {
				this.handleSetLatestValue(msg);
				break;
			}
			case "setLatestMapValue": {
				this.handleSetLatestMapValue(msg);
				break;
			}
			case "getLatestValue": {
				this.handleGetLatestValue(msg);
				break;
			}
			case "getLatestMapValue": {
				this.handleGetLatestMapValue(msg);
				break;
			}
			case "registerWorkspace": {
				this.registerWorkspace(msg.workspaceId, {
					latest: msg.latest,
					latestMap: msg.latestMap,
				});
				break;
			}
			default: {
				console.error(`${process_id}: Unknown command`);
				send({ event: "error", error: `${process_id} Unknown command` });
			}
		}
	}

	private handlePing(): void {
		send({ event: "ack" });
	}

	private async handleConnect(
		msg: Extract<MessageFromParent, { command: "connect" }>,
	): Promise<void> {
		if (!msg.user) {
			send({ event: "error", error: `${process_id}: No azure user information given` });
			return;
		}
		if (isConnected(this.container)) {
			send({ event: "error", error: `${process_id}: Already connected to container` });
			return;
		}
		const { container, presence, containerId } = await getOrCreatePresenceContainer(
			msg.containerId,
			msg.user,
			msg.scopes,
			msg.createScopes,
		);
		this.container = container;
		this.presence = presence;
		this.containerId = containerId;
		presence.attendees.events.on("attendeeConnected", (attendee: Attendee) => {
			send({ event: "attendeeConnected", attendeeId: attendee.attendeeId });
		});
		presence.attendees.events.on("attendeeDisconnected", (attendee: Attendee) => {
			send({ event: "attendeeDisconnected", attendeeId: attendee.attendeeId });
		});
		send({
			event: "connected",
			containerId,
			attendeeId: presence.attendees.getMyself().attendeeId,
		});
	}

	private handleDisconnectSelf(): void {
		if (!this.container) {
			send({ event: "error", error: `${process_id} is not connected to container` });
			return;
		}
		if (!this.presence) {
			send({ event: "error", error: `${process_id} is not connected to presence` });
			return;
		}
		this.container.disconnect();
		send({
			event: "disconnectedSelf",
			attendeeId: this.presence.attendees.getMyself().attendeeId,
		});
	}

	private handleSetLatestValue(
		msg: Extract<MessageFromParent, { command: "setLatestValue" }>,
	): void {
		if (!this.presence) {
			send({ event: "error", error: `${process_id} is not connected to presence` });
			return;
		}
		const workspace = this.workspaces.get(msg.workspaceId);
		if (!workspace) {
			send({ event: "error", error: `${process_id} workspace ${msg.workspaceId} not found` });
			return;
		}
		// Cast required due to optional keys in WorkspaceSchema
		// TODO: AB#47518
		const latestState = workspace.states.latest as LatestRaw<{ value: string }> | undefined;
		if (!latestState) {
			send({
				event: "error",
				error: `${process_id} latest state not registered for workspace ${msg.workspaceId}`,
			});
			return;
		}
		if (typeof msg.value !== "string") {
			return;
		}
		latestState.local = { value: msg.value };
	}

	private handleSetLatestMapValue(
		msg: Extract<MessageFromParent, { command: "setLatestMapValue" }>,
	): void {
		if (!this.presence) {
			send({ event: "error", error: `${process_id} is not connected to presence` });
			return;
		}
		if (typeof msg.key !== "string") {
			send({ event: "error", error: `${process_id} invalid key type` });
			return;
		}
		const workspace = this.workspaces.get(msg.workspaceId);
		if (!workspace) {
			send({ event: "error", error: `${process_id} workspace ${msg.workspaceId} not found` });
			return;
		}
		// Cast required due to optional keys in WorkspaceSchema
		// TODO: AB#47518
		const latestMapState = workspace.states.latestMap as
			| LatestMapRaw<{ value: Record<string, string | number> }, string>
			| undefined;
		if (!latestMapState) {
			send({
				event: "error",
				error: `${process_id} latestMap state not registered for workspace ${msg.workspaceId}`,
			});
			return;
		}
		if (!isStringOrNumberRecord(msg.value)) {
			return;
		}
		latestMapState.local.set(msg.key, { value: msg.value });
	}

	private handleGetLatestValue(
		msg: Extract<MessageFromParent, { command: "getLatestValue" }>,
	): void {
		if (!this.presence) {
			send({ event: "error", error: `${process_id} is not connected to presence` });
			return;
		}
		const workspace = this.workspaces.get(msg.workspaceId);
		if (!workspace) {
			send({ event: "error", error: `${process_id} workspace ${msg.workspaceId} not found` });
			return;
		}
		// Cast required due to optional keys in WorkspaceSchema
		// TODO: AB#47518
		const latestState = workspace.states.latest as LatestRaw<{ value: string }> | undefined;
		if (!latestState) {
			send({
				event: "error",
				error: `${process_id} latest state not registered for workspace ${msg.workspaceId}`,
			});
			return;
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
	}

	private handleGetLatestMapValue(
		msg: Extract<MessageFromParent, { command: "getLatestMapValue" }>,
	): void {
		if (!this.presence) {
			send({ event: "error", error: `${process_id} is not connected to presence` });
			return;
		}
		if (typeof msg.key !== "string") {
			send({ event: "error", error: `${process_id} invalid key type` });
			return;
		}
		const workspace = this.workspaces.get(msg.workspaceId);
		if (!workspace) {
			send({ event: "error", error: `${process_id} workspace ${msg.workspaceId} not found` });
			return;
		}
		// Cast required due to optional keys in WorkspaceSchema
		// TODO: AB#47518
		const latestMapState = workspace.states.latestMap as
			| LatestMapRaw<{ value: Record<string, string | number> }, string>
			| undefined;
		if (!latestMapState) {
			send({
				event: "error",
				error: `${process_id} latestMap state not registered for workspace ${msg.workspaceId}`,
			});
			return;
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
