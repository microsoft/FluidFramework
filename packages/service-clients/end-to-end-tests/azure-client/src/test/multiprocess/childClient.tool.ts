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
import type { ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
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

import type {
	MessageFromChild as MessageToParent,
	MessageToChild as MessageFromParent,
	UserIdAndName,
	EventEntry,
} from "./messageTypes.js";

const testLabel = process.argv[2];
// Identifier given to child process
const process_id = process.argv[3];
const verbosity = process.argv[4] ?? "";

const useAzure = process.env.FLUID_CLIENT === "azure";
const tenantId = useAzure
	? (process.env.azure__fluid__relay__service__tenantId as string)
	: "frs-client-tenant";
const endPoint = process.env.azure__fluid__relay__service__endpoint as string;
if (useAzure && endPoint === undefined) {
	throw new Error("Azure Fluid Relay service endpoint is missing");
}

const containerSchema = {
	initialObjects: {
		// A DataObject is added as otherwise fluid-static complains "Container cannot be initialized without any DataTypes"
		_unused: TestDataObject,
	},
} as const satisfies ContainerSchema;

function log(...data: unknown[]): void {
	console.log(`[${testLabel}] [${new Date().toISOString()}] [${process_id}]`, ...data);
}

function telemetryEventInterestLevel(eventName: string): "none" | "basic" | "details" {
	if (eventName.includes(":Signal") || eventName.includes(":Join")) {
		return "details";
	} else if (eventName.includes(":Container:") || eventName.includes(":Presence:")) {
		return "basic";
	}
	return "none";
}

function selectiveVerboseLog(event: ITelemetryBaseEvent, logLevel?: LogLevel): void {
	const interest = telemetryEventInterestLevel(event.eventName);
	if (interest === "none") {
		return;
	}
	const content: Record<string, unknown> = {
		eventName: event.eventName,
		containerConnectionState: event.containerConnectionState,
	};
	if (interest === "details") {
		content.details = event.details;
	}
	log(`[${logLevel ?? LogLevel.default}]`, content);
}

/**
 * Get or create a Fluid container.
 */
const getOrCreateContainer = async (params: {
	logger: ITelemetryBaseLogger;
	onDisconnected: () => void;
	containerId?: string;
	user: UserIdAndName;
	scopes?: ScopeType[];
	createScopes?: ScopeType[];
	connectTimeoutMs: number;
}): Promise<{
	container: IFluidContainer<typeof containerSchema>;
	services: AzureContainerServices;
	client: AzureClient;
	containerId: string;
	connected: Promise<void>;
}> => {
	let container: IFluidContainer<typeof containerSchema>;
	let { containerId } = params;
	const { logger, onDisconnected, user, scopes, createScopes, connectTimeoutMs } = params;
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
		logger,
	});
	let services: AzureContainerServices;
	if (containerId === undefined) {
		({ container, services } = await client.createContainer(containerSchema, "2"));
		containerId = await container.attach();
	} else {
		({ container, services } = await client.getContainer(containerId, containerSchema, "2"));
	}
	container.on("disconnected", onDisconnected);

	const connected =
		container.connectionState === ConnectionState.Connected
			? Promise.resolve()
			: timeoutPromise((resolve) => container.once("connected", () => resolve()), {
					durationMs: connectTimeoutMs,
					errorMsg: "container connect() timeout",
				});

	assert.strictEqual(
		container.attachState,
		AttachState.Attached,
		"Container is not attached after attach is called",
	);

	return {
		client,
		container,
		services,
		containerId,
		connected,
	};
};

function createSendFunction(): (msg: MessageToParent) => void {
	if (process.send) {
		const sendFn = process.send.bind(process);
		if (verbosity.includes("msgs")) {
			return (msg: MessageToParent) => {
				log(`Sending`, msg);
				sendFn(msg);
			};
		}
		return sendFn;
	}
	throw new Error("process.send is not defined");
}

const send = createSendFunction();

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
	private readonly log: EventEntry[] = [];
	private msgQueue: undefined | Exclude<MessageFromParent, { command: "ping" | "connect" }>[];
	private container: IFluidContainer | undefined;
	private presence: Presence | undefined;
	private readonly workspaces = new Map<string, StatesWorkspace<WorkspaceSchema>>();

	private send(msg: MessageToParent): void {
		this.log.push({
			timestamp: Date.now(),
			agentId: process_id,
			eventCategory: "messageSent",
			eventName: msg.event,
			details:
				msg.event === "debugReportComplete" && msg.log
					? JSON.stringify({ logLength: msg.log.length })
					: JSON.stringify(msg),
		});
		send(msg);
	}

	private readonly sendAttendeeConnected = (attendee: Attendee): void => {
		this.send({
			event: "attendeeConnected",
			attendeeId: attendee.attendeeId,
		});
	};
	private readonly sendAttendeeDisconnected = (attendee: Attendee): void => {
		this.send({
			event: "attendeeDisconnected",
			attendeeId: attendee.attendeeId,
		});
	};

	private readonly logger: ITelemetryBaseLogger = {
		send: (event: ITelemetryBaseEvent, logLevel?: LogLevel) => {
			// Filter out non-interactive client telemetry
			const clientType = event.clientType;
			if (typeof clientType === "string" && clientType.startsWith("noninteractive")) {
				return;
			}

			// Special case unexpected telemetry event
			if (event.eventName.endsWith(":JoinResponseWhenAlone")) {
				this.send({
					event: "error",
					error: `Unexpected ClientJoin response. Details: ${JSON.stringify(event.details)}\nLog: ${JSON.stringify(this.log)}`,
				});
				// Keep going
			}

			const interest = telemetryEventInterestLevel(event.eventName);
			if (interest === "none") {
				return;
			}
			this.log.push({
				timestamp: Date.now(),
				agentId: process_id,
				eventCategory: "telemetry",
				eventName: event.eventName,
				details:
					typeof event.details === "string" ? event.details : JSON.stringify(event.details),
			});
			if (verbosity.includes("telem")) {
				selectiveVerboseLog(event, logLevel);
			}
		},
	};

	private readonly onDisconnected = (): void => {
		// Test state is a bit fragile and does not account for reconnections.
		this.send({ event: "error", error: `${process_id}: Container disconnected` });
	};

	private registerWorkspace(
		workspaceId: string,
		options: { latest?: boolean; latestMap?: boolean },
	): void {
		if (!this.presence) {
			this.send({ event: "error", error: `${process_id} is not connected to presence` });
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
				this.send({
					event: "latestValueUpdated",
					workspaceId,
					attendeeId: update.attendee.attendeeId,
					value: update.value.value,
				});
			});
			for (const remote of latestState.getRemotes()) {
				this.send({
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
					this.send({
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
					this.send({
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
		this.send({
			event: "workspaceRegistered",
			workspaceId,
			latest: latest ?? false,
			latestMap: latestMap ?? false,
		});
	}

	public async onMessage(msg: MessageFromParent): Promise<void> {
		if (verbosity.includes("msgs")) {
			this.log.push({
				timestamp: Date.now(),
				agentId: process_id,
				eventCategory: "messageReceived",
				eventName: msg.command,
			});
			log(`Received`, msg);
		}

		if (msg.command === "ping") {
			this.handlePing();
			return;
		}

		if (msg.command === "connect") {
			await this.handleConnect(msg);
			return;
		}

		// All other message must wait if connect is in progress
		if (this.msgQueue !== undefined) {
			this.msgQueue.push(msg);
			return;
		}

		this.processMessage(msg);
	}

	private processMessage(
		msg: Exclude<MessageFromParent, { command: "ping" | "connect" }>,
	): void {
		switch (msg.command) {
			case "debugReport": {
				this.handleDebugReport(msg);
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
				console.error(`${process_id}: Unknown command:`, msg);
				this.send({
					event: "error",
					error: `${process_id} Unknown command: ${JSON.stringify(msg)}`,
				});
			}
		}
	}

	private handlePing(): void {
		this.send({ event: "ack" });
	}

	private async handleConnect(
		msg: Extract<MessageFromParent, { command: "connect" }>,
	): Promise<void> {
		if (!msg.user) {
			this.send({ event: "error", error: `${process_id}: No azure user information given` });
			return;
		}
		if (this.container) {
			this.send({ event: "error", error: `${process_id}: Container already loaded` });
			return;
		}

		// Prevent reentrance. Queue messages until after connect is fully processed.
		this.msgQueue = [];

		try {
			const { container, containerId, connected } = await getOrCreateContainer({
				...msg,
				logger: this.logger,
				onDisconnected: this.onDisconnected,
			});
			this.container = container;
			const presence = getPresence(container);
			this.presence = presence;

			// wait for 'ConnectionState.Connected'
			await connected.catch((error) => {
				(error as Error).message += `\nLog: ${JSON.stringify(this.log)}`;
				throw error;
			});

			// Acknowledge connection before sending current attendee information
			this.send({
				event: "connected",
				containerId,
				attendeeId: presence.attendees.getMyself().attendeeId,
			});

			// Send existing attendees excluding self to parent/orchestrator
			const self = presence.attendees.getMyself();
			for (const attendee of presence.attendees.getAttendees()) {
				if (attendee !== self && attendee.getConnectionStatus() === "Connected") {
					this.sendAttendeeConnected(attendee);
				}
			}

			// Listen for presence events to notify parent/orchestrator when a new attendee joins or leaves the session.
			presence.attendees.events.on("attendeeConnected", this.sendAttendeeConnected);
			presence.attendees.events.on("attendeeDisconnected", this.sendAttendeeDisconnected);
		} finally {
			// Process any queued messages received while connecting
			for (const queuedMsg of this.msgQueue) {
				this.processMessage(queuedMsg);
			}
			this.msgQueue = undefined;
		}
	}

	private handleDebugReport(
		msg: Extract<MessageFromParent, { command: "debugReport" }>,
	): void {
		if (msg.reportAttendees) {
			if (this.presence) {
				const attendees = this.presence.attendees.getAttendees();
				let connectedCount = 0;
				for (const attendee of attendees) {
					if (attendee.getConnectionStatus() === "Connected") {
						connectedCount++;
					}
				}
				log(`Report: ${attendees.size} attendees, ${connectedCount} connected`);
			} else {
				this.send({ event: "error", error: `${process_id} is not connected to presence` });
			}
		}

		const debugReport: Extract<MessageToParent, { event: "debugReportComplete" }> = {
			event: "debugReportComplete",
		};
		if (msg.sendEventLog) {
			debugReport.log = this.log;
		}
		this.send(debugReport);
	}

	private handleDisconnectSelf(): void {
		if (!this.container) {
			this.send({ event: "error", error: `${process_id} is not connected to container` });
			return;
		}
		// There are no current scenarios where disconnect without presence is expected.
		if (!this.presence) {
			this.send({ event: "error", error: `${process_id} is not connected to presence` });
			return;
		}
		// Disconnect event is treated as an error in normal handling.
		// Remove listener as this disconnect is intentional.
		this.container.off("disconnected", this.onDisconnected);
		this.container.disconnect();
		this.send({
			event: "disconnectedSelf",
			attendeeId: this.presence.attendees.getMyself().attendeeId,
		});
	}

	private handleSetLatestValue(
		msg: Extract<MessageFromParent, { command: "setLatestValue" }>,
	): void {
		if (!this.presence) {
			this.send({ event: "error", error: `${process_id} is not connected to presence` });
			return;
		}
		const workspace = this.workspaces.get(msg.workspaceId);
		if (!workspace) {
			this.send({
				event: "error",
				error: `${process_id} workspace ${msg.workspaceId} not found`,
			});
			return;
		}
		// Cast required due to optional keys in WorkspaceSchema
		// TODO: AB#47518
		const latestState = workspace.states.latest as LatestRaw<{ value: string }> | undefined;
		if (!latestState) {
			this.send({
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
			this.send({ event: "error", error: `${process_id} is not connected to presence` });
			return;
		}
		if (typeof msg.key !== "string") {
			this.send({ event: "error", error: `${process_id} invalid key type` });
			return;
		}
		const workspace = this.workspaces.get(msg.workspaceId);
		if (!workspace) {
			this.send({
				event: "error",
				error: `${process_id} workspace ${msg.workspaceId} not found`,
			});
			return;
		}
		// Cast required due to optional keys in WorkspaceSchema
		// TODO: AB#47518
		const latestMapState = workspace.states.latestMap as
			| LatestMapRaw<{ value: Record<string, string | number> }, string>
			| undefined;
		if (!latestMapState) {
			this.send({
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
			this.send({ event: "error", error: `${process_id} is not connected to presence` });
			return;
		}
		const workspace = this.workspaces.get(msg.workspaceId);
		if (!workspace) {
			this.send({
				event: "error",
				error: `${process_id} workspace ${msg.workspaceId} not found`,
			});
			return;
		}
		// Cast required due to optional keys in WorkspaceSchema
		// TODO: AB#47518
		const latestState = workspace.states.latest as LatestRaw<{ value: string }> | undefined;
		if (!latestState) {
			this.send({
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
		this.send({
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
			this.send({ event: "error", error: `${process_id} is not connected to presence` });
			return;
		}
		if (typeof msg.key !== "string") {
			this.send({ event: "error", error: `${process_id} invalid key type` });
			return;
		}
		const workspace = this.workspaces.get(msg.workspaceId);
		if (!workspace) {
			this.send({
				event: "error",
				error: `${process_id} workspace ${msg.workspaceId} not found`,
			});
			return;
		}
		// Cast required due to optional keys in WorkspaceSchema
		// TODO: AB#47518
		const latestMapState = workspace.states.latestMap as
			| LatestMapRaw<{ value: Record<string, string | number> }, string>
			| undefined;
		if (!latestMapState) {
			this.send({
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
		this.send({
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
			console.error(`[${testLabel}] Error in client ${process_id}`, error);
			send({ event: "error", error: `${process_id}: ${error.message}` });
		});
	});
}

setupMessageHandler();
