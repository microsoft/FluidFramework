/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { InboundExtensionMessage } from "@fluidframework/container-runtime-definitions/internal";
import type {
	InternalUtilityTypes,
	JsonDeserialized,
} from "@fluidframework/core-interfaces/internal";
import type { EventAndErrorTrackingLogger } from "@fluidframework/test-utils/internal";
import { getUnexpectedLogErrorException } from "@fluidframework/test-utils/internal";
import { spy } from "sinon";
import type { SinonFakeTimers } from "sinon";

import { createPresenceManager } from "../presenceManager.js";
import type {
	InboundClientJoinMessage,
	OutboundClientJoinMessage,
	SignalMessages,
} from "../protocol.js";
import type { SystemWorkspaceDatastore } from "../systemWorkspace.js";

import type { MockEphemeralRuntime } from "./mockEphemeralRuntime.js";

import type {
	AttendeeId,
	ClientConnectionId,
	PresenceWithNotifications,
	StateSchemaValidator,
} from "@fluidframework/presence/alpha";

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

type SpecificAttendeeId<T extends string> = string extends T
	? never
	: Exclude<T & AttendeeId, never>;

/**
 * Forms {@link AttendeeId} for a specific attendee
 */
export function createSpecificAttendeeId<const T extends string>(
	id: T,
): SpecificAttendeeId<T> {
	return id as SpecificAttendeeId<T>;
}

/**
 * Mock {@link AttendeeId}.
 */
export const attendeeId1 = createSpecificAttendeeId("attendeeId-1");
/**
 * Mock {@link ClientConnectionId}.
 */
export const connectionId1 = "client1" as const satisfies ClientConnectionId;
/**
 * Mock {@link AttendeeId}.
 */
export const attendeeId2 = createSpecificAttendeeId("attendeeId-2");
/**
 * Mock {@link ClientConnectionId}.
 */
export const connectionId2 = "client2" as const satisfies ClientConnectionId;

/**
 * Generates expected inbound join signal for a client that was initialized while connected.
 */
export function generateBasicClientJoin(
	fixedTime: number,
	{
		attendeeId = attendeeId2,
		clientConnectionId = connectionId2,
		updateProviders = ["client0", "client1", "client3"],
		connectionOrder = 0,
		averageLatency = 0,
		priorClientToSessionId = {},
	}: {
		attendeeId?: string;
		clientConnectionId?: ClientConnectionId;
		updateProviders?: string[];
		connectionOrder?: number;
		averageLatency?: number;
		priorClientToSessionId?: SystemWorkspaceDatastore["clientToSessionId"];
	},
): InboundClientJoinMessage {
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
							"value": attendeeId as AttendeeId,
						},
					},
				},
			},
			"sendTimestamp": fixedTime,
			updateProviders,
		},
		clientId: clientConnectionId,
	};
}

/**
 * Function signature for sending a signal to the presence manager.
 */
export type ProcessSignalFunction = ReturnType<typeof createPresenceManager>["processSignal"];

/**
 * Prepares an instance of presence as it would be if initialized while connected.
 *
 * @param runtime - the mock runtime
 * @param attendeeId - the client session id given to presence
 * @param clientConnectionId - the client connection id
 * @param clock - the fake timer.
 * @param logger - optional logger to track telemetry events
 */
export function prepareConnectedPresence(
	runtime: MockEphemeralRuntime,
	attendeeId: string,
	clientConnectionId: ClientConnectionId,
	clock: Omit<SinonFakeTimers, "restore">,
	logger?: EventAndErrorTrackingLogger,
): {
	presence: PresenceWithNotifications;
	processSignal: ProcessSignalFunction;
} {
	// Set runtime to connected state
	runtime.clientId = clientConnectionId;
	runtime.connected = true;

	logger?.registerExpectedEvent({ eventName: "Presence:PresenceInstantiated" });

	// This logic needs to be kept in sync with datastore manager.
	const quorumClientIds = [...runtime.quorum.getMembers().keys()].filter(
		(quorumClientId) => quorumClientId !== clientConnectionId,
	);
	if (quorumClientIds.length > 3) {
		quorumClientIds.length = 3;
	}

	const expectedClientJoin: OutboundClientJoinMessage &
		Partial<Pick<InboundClientJoinMessage, "clientId">> = generateBasicClientJoin(clock.now, {
		attendeeId,
		clientConnectionId,
		updateProviders: quorumClientIds,
	});
	delete expectedClientJoin.clientId;
	runtime.signalsExpected.push([expectedClientJoin]);

	const presence = createPresenceManager(runtime, attendeeId as AttendeeId);

	const processSignal = (
		addressChain: string[],
		signalMessage: InboundExtensionMessage<SignalMessages>,
		local: boolean,
	): void => {
		// Pass on to presence manager, but first clone the message to avoid
		// possibility of Presence mutating the original message which often
		// contains reference to general (shared) test data.
		// Additionally JSON.parse(JSON.stringify(signalMessage)) is used to
		// ensure only regular JSON-serializable data is passed to Presence.
		// In production environment, the message is always extracted from
		// the network and Presence can safely mutate it.
		presence.processSignal(
			addressChain,
			JSON.parse(JSON.stringify(signalMessage)) as InboundExtensionMessage<SignalMessages>,
			local,
		);
	};

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
	processSignal([], { ...expectedClientJoin, clientId: clientConnectionId }, true);

	return {
		presence,
		processSignal,
	};
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

/**
 * A null validator (one that does nothing) for a given type T. It simply casts the value to
 * `JsonDeserialized<T>`.
 */
const nullValidator = <T extends object>(data: unknown): JsonDeserialized<T> => {
	return data as JsonDeserialized<T>;
};

/**
 * Creates a spied validator for test purposes.
 *
 * @param validatorFunction - A {@link StateSchemaValidator} to wrap in a spy.
 */
export const createSpiedValidator = <T extends object>(
	validatorFunction: StateSchemaValidator<T> = nullValidator<T>,
	// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types, @typescript-eslint/explicit-function-return-type
) => spy(validatorFunction) satisfies StateSchemaValidator<T>;
