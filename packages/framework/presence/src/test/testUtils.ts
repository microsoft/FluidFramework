/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { EventAndErrorTrackingLogger } from "@fluidframework/test-utils/internal";
import { getUnexpectedLogErrorException } from "@fluidframework/test-utils/internal";
import type { SinonFakeTimers } from "sinon";

import { createPresenceManager } from "../presenceManager.js";

import type { MockEphemeralRuntime } from "./mockEphemeralRuntime.js";

import type { ClientConnectionId, ClientSessionId } from "@fluidframework/presence/alpha";
import type { IExtensionMessage } from "@fluidframework/presence/internal/container-definitions/internal";
import type { InternalUtilityTypes } from "@fluidframework/presence/internal/core-interfaces";

/**
 * Use to compile-time assert types of two variables are identical.
 */
export function assertIdenticalTypes<T, U>(
	_actual: T & InternalUtilityTypes.IfSameType<T, U>,
	_expected: U & InternalUtilityTypes.IfSameType<T, U>,
): InternalUtilityTypes.IfSameType<T, U> {
	return undefined as InternalUtilityTypes.IfSameType<T, U>;
}

/**
 * Creates a non-viable (`undefined`) instance of type T to be used for type checking.
 */
export function createInstanceOf<T>(): T {
	return undefined as T;
}

/**
 * Generates expected join signal for a client that was initialized while connected.
 */
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types, @typescript-eslint/explicit-function-return-type
export function generateBasicClientJoin(
	fixedTime: number,
	{
		clientSessionId = "seassionId-2",
		clientConnectionId = "client2",
		updateProviders = ["client0", "client1", "client3"],
		connectionOrder = 0,
		averageLatency = 0,
		priorClientToSessionId = {},
	}: {
		clientSessionId?: string;
		clientConnectionId?: ClientConnectionId;
		updateProviders?: string[];
		connectionOrder?: number;
		averageLatency?: number;
		priorClientToSessionId?: Record<
			ClientConnectionId,
			{ rev: number; timestamp: number; value: string }
		>;
	},
) {
	return {
		type: "Pres:ClientJoin",
		content: {
			"avgLatency": averageLatency,
			"data": {
				"system:presence": {
					"clientToSessionId": {
						...priorClientToSessionId,
						[clientConnectionId]: {
							"rev": connectionOrder,
							"timestamp": fixedTime,
							"value": clientSessionId,
						},
					},
				},
			},
			"sendTimestamp": fixedTime,
			updateProviders,
		},
		clientId: clientConnectionId,
	} satisfies IExtensionMessage<"Pres:ClientJoin">;
}

/**
 * Prepares an instance of presence as it would be if initialized while connected.
 *
 * @param runtime - the mock runtime
 * @param clientSessionId - the client session id given to presence
 * @param clientConnectionId - the client connection id
 * @param clock - the fake timer.
 * @param logger - optional logger to track telemetry events
 */
export function prepareConnectedPresence(
	runtime: MockEphemeralRuntime,
	clientSessionId: string,
	clientConnectionId: ClientConnectionId,
	clock: Omit<SinonFakeTimers, "restore">,
	logger?: EventAndErrorTrackingLogger,
): ReturnType<typeof createPresenceManager> {
	// Set runtime to connected state
	runtime.clientId = clientConnectionId;
	// TODO: runtime.connected has been hacked in past to lie about true connection.
	// This will need to be updated to an alternate status provider.
	runtime.connected = true;

	logger?.registerExpectedEvent({ eventName: "Presence:PresenceInstantiated" });

	// This logic needs to be kept in sync with datastore manager.
	const quorumClientIds = [...runtime.quorum.getMembers().keys()].filter(
		(quorumClientId) => quorumClientId !== clientConnectionId,
	);
	if (quorumClientIds.length > 3) {
		quorumClientIds.length = 3;
	}

	const expectedClientJoin = generateBasicClientJoin(clock.now, {
		clientSessionId,
		clientConnectionId,
		updateProviders: quorumClientIds,
	});
	runtime.signalsExpected.push([expectedClientJoin.type, expectedClientJoin.content]);

	const presence = createPresenceManager(runtime, clientSessionId as ClientSessionId);

	// Validate expectations post initialization to make sure logger
	// and runtime are left in a clean expectation state.
	const logErrors = getUnexpectedLogErrorException(logger);
	if (logErrors) {
		throw logErrors;
	}
	runtime.assertAllSignalsSubmitted();

	// Pass a little time (to mimic reality)
	clock.tick(10);

	// Return the join signal
	presence.processSignal("", { ...expectedClientJoin, clientId: clientConnectionId }, true);

	return presence;
}

/**
 * Asserts that all expected telemetry and signals were sent.
 */
export function assertFinalExpectations(
	runtime: MockEphemeralRuntime,
	logger?: EventAndErrorTrackingLogger,
): void {
	// Make sure all expected events were logged and there are no unexpected errors.
	const logErrors = getUnexpectedLogErrorException(logger);
	if (logErrors) {
		throw logErrors;
	}
	// Make sure all expected signals were sent.
	runtime.assertAllSignalsSubmitted();
}
