/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fork, type ChildProcess } from "node:child_process";

// eslint-disable-next-line import/no-internal-modules
import type { AttendeeId } from "@fluidframework/presence/beta";
import { timeoutAwait, timeoutPromise } from "@fluidframework/test-utils/internal";

import type {
	ConnectCommand,
	MessageFromChild,
	LatestValueUpdatedEvent,
	LatestMapValueUpdatedEvent,
	LatestValueGetResponseEvent,
	LatestMapValueGetResponseEvent,
} from "./messageTypes.js";

/**
 * Fork child processes to simulate multiple Fluid clients.
 *
 * @remarks
 * Individual child processes may be scheduled concurrently on a multi-core CPU
 * and separate processes will never share a port when connected to a service.
 *
 * @param numProcesses - The number of child processes to fork.
 * @param cleanUpAccumulator - An array to accumulate cleanup functions for each child.
 * @returns A collection of child processes and a promise that rejects on the first child error.
 */
export async function forkChildProcesses(
	numProcesses: number,
	cleanUpAccumulator: (() => void)[],
): Promise<{
	children: ChildProcess[];
	childErrorPromise: Promise<void>;
}> {
	const children: ChildProcess[] = [];
	const childReadyPromises: Promise<void>[] = [];
	const childErrorPromises: Promise<void>[] = [];
	for (let i = 0; i < numProcesses; i++) {
		const child = fork("./lib/test/multiprocess/childClient.js", [
			`child${i}` /* identifier passed to child process */,
		]);
		cleanUpAccumulator.push(() => {
			child.kill();
			child.removeAllListeners();
		});
		const readyPromise = new Promise<void>((resolve, reject) => {
			child.once("message", (msg: MessageFromChild) => {
				if (msg.event === "ack") {
					resolve();
				} else {
					reject(
						new Error(`Unexpected (non-"ack") message from child${i}: ${JSON.stringify(msg)}`),
					);
				}
			});
		});
		childReadyPromises.push(readyPromise);
		const errorPromise = new Promise<void>((_resolve, reject) => {
			child.on("error", (error) => {
				reject(new Error(`Child${i} process errored: ${error.message}`));
			});
		});
		childErrorPromises.push(errorPromise);
		child.send({ command: "ping" });
		children.push(child);
	}
	const childErrorPromise = Promise.race(childErrorPromises);
	await Promise.race([Promise.all(childReadyPromises), childErrorPromise]);
	return { children, childErrorPromise };
}

/**
 * Creates a {@link ConnectCommand} for a test user with a deterministic id and name.
 *
 * @param id - Suffix used to construct stable test user identity.
 */
export function composeConnectMessage(id: string | number): ConnectCommand {
	return {
		command: "connect",
		user: {
			id: `test-user-id-${id}`,
			name: `test-user-name-${id}`,
		},
	};
}

/**
 * Sends connect commands to the provided child processes.
 *
 * The first child will create the container unless a containerId is pre-specified; subsequent
 * children are sent the discovered containerId.
 */
export async function connectChildProcesses(
	childProcesses: ChildProcess[],
	readyTimeoutMs: number,
): Promise<{
	containerCreatorAttendeeId: AttendeeId;
	attendeeIdPromises: Promise<AttendeeId>[];
}> {
	if (childProcesses.length === 0) {
		throw new Error("No child processes provided for connection.");
	}
	const firstChild = childProcesses[0];
	const containerReadyPromise = new Promise<{
		containerCreatorAttendeeId: AttendeeId;
		containerId: string;
	}>((resolve, reject) => {
		firstChild.once("message", (msg: MessageFromChild) => {
			if (msg.event === "connected" && msg.containerId) {
				resolve({
					containerCreatorAttendeeId: msg.attendeeId,
					containerId: msg.containerId,
				});
			} else {
				reject(new Error(`Non-connected message from child0: ${JSON.stringify(msg)}`));
			}
		});
	});
	firstChild.send(composeConnectMessage(0));
	const { containerCreatorAttendeeId, containerId } = await timeoutAwait(
		containerReadyPromise,
		{
			durationMs: readyTimeoutMs,
			errorMsg: "did not receive 'connected' from child process",
		},
	);

	const attendeeIdPromises: Promise<AttendeeId>[] = [];
	for (const [index, child] of childProcesses.entries()) {
		if (index === 0) {
			attendeeIdPromises.push(Promise.resolve(containerCreatorAttendeeId));
			continue;
		}
		const message = composeConnectMessage(index);
		message.containerId = containerId;
		attendeeIdPromises.push(
			new Promise<AttendeeId>((resolve, reject) => {
				child.once("message", (msg: MessageFromChild) => {
					if (msg.event === "connected") {
						resolve(msg.attendeeId);
					} else if (msg.event === "error") {
						reject(new Error(`Child process error: ${msg.error}`));
					}
				});
			}),
		);
		child.send(message);
	}
	return { containerCreatorAttendeeId, attendeeIdPromises };
}

/**
 * Connects the child processes and waits for the specified number of attendees to connect.
 */
export async function connectAndWaitForAttendees(
	children: ChildProcess[],
	attendeeCountRequired: number,
	childConnectTimeoutMs: number,
	attendeesJoinedTimeoutMs: number,
	earlyExitPromise: Promise<void> = Promise.resolve(),
): Promise<{ containerCreatorAttendeeId: AttendeeId }> {
	const attendeeConnectedPromise = new Promise<void>((resolve) => {
		let attendeesJoinedEvents = 0;
		children[0].on("message", (msg: MessageFromChild) => {
			if (msg.event === "attendeeConnected") {
				attendeesJoinedEvents++;
				if (attendeesJoinedEvents >= attendeeCountRequired) {
					resolve();
				}
			}
		});
	});
	const connectResult = await connectChildProcesses(children, childConnectTimeoutMs);
	Promise.all(connectResult.attendeeIdPromises).catch((error) => {
		console.error("Error connecting children:", error);
	});
	await timeoutAwait(Promise.race([attendeeConnectedPromise, earlyExitPromise]), {
		durationMs: attendeesJoinedTimeoutMs,
		errorMsg: "did not receive all 'attendeeConnected' events",
	});
	return connectResult;
}

/**
 * Registers a workspace (latest and/or latestMap) on all provided child processes and waits for acknowledgement.
 *
 * @remarks
 * The listener for the acknowledgement event is attached before sending the command to avoid a race where the
 * child responds faster than the parent attaches the handler.
 *
 * @param children - Child processes representing Fluid clients.
 * @param workspaceId - Logical (unprefixed) workspace id used in tests.
 * @param options - Which state types to register plus optional timeout.
 */
export async function registerWorkspaceOnChildren(
	children: ChildProcess[],
	workspaceId: string,
	options: { latest?: boolean; latestMap?: boolean; timeoutMs?: number },
): Promise<void> {
	const { latest, latestMap, timeoutMs = 10_000 } = options;
	const promises = children.map(async (child, index) => {
		const ackPromise = waitForEvent(
			child,
			"workspaceRegistered",
			(msg) => msg.event === "workspaceRegistered" && msg.workspaceId === workspaceId,
			{
				timeoutMs,
				errorMsg: `Child ${index} did not acknowledge workspace registration ${workspaceId}`,
			},
		);
		child.send({
			command: "registerWorkspace",
			workspaceId,
			latest,
			latestMap,
		});
		await ackPromise;
	});
	await Promise.all(promises);
}

// Basic command type guards
function isLatestValueGetResponse(msg: MessageFromChild): msg is LatestValueGetResponseEvent {
	return msg.event === "latestValueGetResponse";
}
function isLatestMapValueGetResponse(
	msg: MessageFromChild,
): msg is LatestMapValueGetResponseEvent {
	return msg.event === "latestMapValueGetResponse";
}
function isLatestValueUpdated(msg: MessageFromChild): msg is LatestValueUpdatedEvent {
	return msg.event === "latestValueUpdated";
}
function isLatestMapValueUpdated(msg: MessageFromChild): msg is LatestMapValueUpdatedEvent {
	return msg.event === "latestMapValueUpdated";
}

/**
 * Waits for a single message of the specified event type from a child process.
 */
export async function waitForEvent(
	child: ChildProcess,
	eventType: MessageFromChild["event"],
	predicate?: (msg: MessageFromChild) => boolean,
	options: { timeoutMs?: number; errorMsg?: string } = {},
): Promise<MessageFromChild> {
	const { timeoutMs = 10_000, errorMsg = `did not receive '${eventType}' event` } = options;

	let handler: ((msg: MessageFromChild) => void) | undefined;

	const cleanup = (): void => {
		if (handler) {
			child.off("message", handler);
			handler = undefined;
		}
	};

	try {
		return await timeoutPromise<MessageFromChild>(
			(resolve) => {
				handler = (msg: MessageFromChild): void => {
					if (msg.event === eventType && (!predicate || predicate(msg))) {
						cleanup();
						resolve(msg);
					}
				};
				child.on("message", handler);
			},
			{ durationMs: timeoutMs, errorMsg },
		);
	} catch (error) {
		cleanup();
		throw error;
	}
}

/**
 * Waits for latest value updates for the provided workspace from all clients.
 *
 * @param clients - Child processes to wait for updates from
 * @param workspaceId - Workspace ID to filter updates
 * @param earlyExitPromise - Promise that rejects early on error
 * @param timeoutMs - Timeout in milliseconds
 * @param options - Optional filtering criteria with fromAttendeeId and expectedValue properties
 */
export async function waitForLatestValueUpdates(
	clients: ChildProcess[],
	workspaceId: string,
	earlyExitPromise: Promise<void>,
	timeoutMs = 10_000,
	options: { fromAttendeeId?: AttendeeId; expectedValue?: unknown } = {},
): Promise<LatestValueUpdatedEvent[]> {
	const { fromAttendeeId, expectedValue } = options;
	const updatePromises = clients.map(async (child, index) => {
		const filterMsg = (msg: MessageFromChild): boolean => {
			if (!isLatestValueUpdated(msg) || msg.workspaceId !== workspaceId) {
				return false;
			}
			if (fromAttendeeId !== undefined && msg.attendeeId !== fromAttendeeId) {
				return false;
			}
			if (expectedValue !== undefined) {
				return JSON.stringify(msg.value) === JSON.stringify(expectedValue);
			}
			return true;
		};

		let filterDescription = "update";
		if (fromAttendeeId) filterDescription += ` from attendee ${fromAttendeeId}`;
		if (expectedValue !== undefined)
			filterDescription += ` with specific value ${JSON.stringify(expectedValue)}`;
		if (filterDescription === "update") filterDescription = "any update";

		return waitForEvent(child, "latestValueUpdated", filterMsg, {
			timeoutMs,
			errorMsg: `Client ${index} did not receive latest value ${filterDescription}`,
		});
	});
	const responses = await Promise.race([Promise.all(updatePromises), earlyExitPromise]);
	if (!Array.isArray(responses)) {
		throw new TypeError("Expected array of responses");
	}
	const latestValueUpdatedEvents: LatestValueUpdatedEvent[] = [];
	for (const response of responses) {
		if (isLatestValueUpdated(response)) {
			latestValueUpdatedEvents.push(response);
		} else {
			throw new TypeError(`Expected LatestValueUpdated but got ${response.event}`);
		}
	}
	return latestValueUpdatedEvents;
}

/**
 * Waits for latest map value updates (specific key) from all clients.
 *
 * @param clients - Child processes to wait for updates from
 * @param workspaceId - Workspace ID to filter updates
 * @param key - Map key to filter updates
 * @param earlyExitPromise - Promise that rejects early on error
 * @param timeoutMs - Timeout in milliseconds
 * @param options - Optional filtering criteria with fromAttendeeId and expectedValue properties
 */
export async function waitForLatestMapValueUpdates(
	clients: ChildProcess[],
	workspaceId: string,
	key: string,
	earlyExitPromise: Promise<void>,
	timeoutMs = 10_000,
	options: { fromAttendeeId?: AttendeeId; expectedValue?: unknown } = {},
): Promise<LatestMapValueUpdatedEvent[]> {
	const { fromAttendeeId, expectedValue } = options;
	const updatePromises = clients.map(async (child, index) => {
		const filterMsg = (msg: MessageFromChild): boolean => {
			if (
				!isLatestMapValueUpdated(msg) ||
				msg.workspaceId !== workspaceId ||
				msg.key !== key
			) {
				return false;
			}
			if (fromAttendeeId !== undefined && msg.attendeeId !== fromAttendeeId) {
				return false;
			}
			if (expectedValue !== undefined) {
				return JSON.stringify(msg.value) === JSON.stringify(expectedValue);
			}
			return true;
		};

		let filterDescription = `update for key "${key}"`;
		if (fromAttendeeId) filterDescription += ` from attendee ${fromAttendeeId}`;
		if (expectedValue !== undefined)
			filterDescription += ` with specific value ${JSON.stringify(expectedValue)}`;

		return waitForEvent(child, "latestMapValueUpdated", filterMsg, {
			timeoutMs,
			errorMsg: `Client ${index} did not receive latest map value ${filterDescription}`,
		});
	});
	const responses = await Promise.race([Promise.all(updatePromises), earlyExitPromise]);
	if (!Array.isArray(responses)) {
		throw new TypeError("Expected array of responses");
	}
	const latestMapValueUpdatedEvents: LatestMapValueUpdatedEvent[] = [];
	for (const response of responses) {
		if (isLatestMapValueUpdated(response)) {
			latestMapValueUpdatedEvents.push(response);
		} else {
			throw new TypeError(`Expected LatestMapValueUpdated but got ${response.event}`);
		}
	}
	return latestMapValueUpdatedEvents;
}

/**
 * Collects latest value get response events from all clients.
 */
export async function getLatestValueResponses(
	clients: ChildProcess[],
	workspaceId: string,
	earlyExitPromise: Promise<void>,
	timeoutMs = 10_000,
): Promise<LatestValueGetResponseEvent[]> {
	const responsePromises = clients.map(async (child, index) =>
		waitForEvent(
			child,
			"latestValueGetResponse",
			(msg) => isLatestValueGetResponse(msg) && msg.workspaceId === workspaceId,
			{ timeoutMs, errorMsg: `Client ${index} did not respond with latest value` },
		),
	);
	const responses = await Promise.race([Promise.all(responsePromises), earlyExitPromise]);
	if (!Array.isArray(responses)) {
		throw new TypeError("Expected array of responses");
	}
	return responses.map((response) => {
		if (!isLatestValueGetResponse(response)) {
			throw new TypeError(`Expected LatestValueGetResponse but got ${response.event}`);
		}
		return response;
	});
}

/**
 * Collects latest map value get response events from all clients.
 */
export async function getLatestMapValueResponses(
	clients: ChildProcess[],
	workspaceId: string,
	key: string,
	earlyExitPromise: Promise<void>,
	timeoutMs = 10_000,
): Promise<LatestMapValueGetResponseEvent[]> {
	const responsePromises = clients.map(async (child, index) =>
		waitForEvent(
			child,
			"latestMapValueGetResponse",
			(msg) =>
				isLatestMapValueGetResponse(msg) && msg.workspaceId === workspaceId && msg.key === key,
			{ timeoutMs, errorMsg: `Client ${index} did not respond with latest map value` },
		),
	);
	const responses = await Promise.race([Promise.all(responsePromises), earlyExitPromise]);
	if (!Array.isArray(responses)) {
		throw new TypeError("Expected array of responses");
	}
	return responses.map((response) => {
		if (!isLatestMapValueGetResponse(response)) {
			throw new TypeError(`Expected LatestMapValueGetResponse but got ${response.event}`);
		}
		return response;
	});
}
